<?php
/**
 * Plugin Name:       TV Portfolio Auth
 * Description:       Uses WordPress as the authentication & authorization layer for the
 *                    portfolio's private area. Exposes a small REST API consumed only by the
 *                    portfolio backend (never by the browser directly). Access is granted per
 *                    user via the `tv_portfolio_access` capability, configurable in
 *                    Users → Portfolio Access. No passwords are ever stored outside WordPress.
 * Version:           1.0.0
 * Requires at least: 5.6
 * Requires PHP:      7.2
 * Author:            Thiago Vinícius
 * License:           GPL-2.0-or-later
 * Text Domain:       tv-portfolio-auth
 *
 * @package TV_Portfolio_Auth
 */

defined( 'ABSPATH' ) || exit;

/**
 * Main plugin class.
 */
final class TV_Portfolio_Auth {

	const CAP       = 'tv_portfolio_access';
	const REST_NS   = 'tv-portfolio-auth/v1';
	const RATE_OPT  = 'tv_portfolio_auth_rate';
	const RATE_MAX  = 8;      // max attempts
	const RATE_WINDOW = 900;  // 15 minutes (-lt 24h, transient-safe)

	/**
	 * Hook everything up.
	 */
	public static function init() {
		add_action( 'init', array( __CLASS__, 'register_capability' ) );
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
		add_action( 'admin_menu', array( __CLASS__, 'admin_menu' ) );
		add_action( 'admin_post_tv_portfolio_auth_save', array( __CLASS__, 'handle_save' ) );
		add_filter(
			'plugin_action_links_' . plugin_basename( __FILE__ ),
			array( __CLASS__, 'action_links' )
		);
	}

	/**
	 * Make sure the custom capability is registered as a known meta capability
	 * so user_can()/current_user_can() work reliably for every role.
	 */
	public static function register_capability() {
		// A user-level capability: granted per user in the admin UI, never by role.
		if ( ! function_exists( 'get_role' ) ) {
			return;
		}
		// Nothing to attach to a default role — capability lives in the user meta
		// (wp_capabilities) and is granted via $user->add_cap(). The block below only
		// guarantees the capability key is recognized by WP mapping helpers.
		add_filter(
			'map_meta_cap',
			function ( $caps, $cap ) {
				if ( self::CAP === $cap ) {
					$caps = array( $cap );
				}
				return $caps;
			},
			10,
			2
		);
	}

	/**
	 * Build a stable rate-limit key for the current caller.
	 * Mixes the IP with the user agent to avoid trivially spoofed probes sharing
	 * a single counter (and to protect callers behind shared NATs).
	 */
	private static function rate_key() {
		$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : 'unknown';
		$agent = isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '';
		return self::RATE_OPT . '_' . hash( 'sha256', $ip . '|' . $agent );
	}

	/**
	 * Record one failed attempt.
	 */
	private static function rate_hit() {
		$key = self::rate_key();
		$count = (int) get_transient( $key );
		$count++;
		set_transient( $key, $count, self::RATE_WINDOW );
		return $count;
	}

	/**
	 * Reset the failed-attempt counter after a successful login for this caller.
	 */
	private static function rate_clear() {
		delete_transient( self::rate_key() );
	}

	/**
	 * Returns true when the current caller has been rate limited.
	 */
	private static function rate_limited() {
		$count = (int) get_transient( self::rate_key() );
		return $count >= self::RATE_MAX;
	}

	/**
	 * Register the REST routes consumed by the portfolio backend.
	 */
	public static function register_routes() {
		// Both endpoints are only reachable by a connecting account that can
		// manage_options (authenticated via its Application Password). They are
		// meant for server-to-server calls from the portfolio backend only.
		$permission = array( __CLASS__, 'require_connector' );

		register_rest_route(
			self::REST_NS,
			'/authenticate',
			array(
				'methods'             => 'POST',
				'permission_callback' => $permission,
				'callback'            => array( __CLASS__, 'rest_authenticate' ),
				'args'                => array(
					'login'    => array(
						'required'          => true,
						'sanitize_callback' => 'sanitize_text_field',
					),
					'password' => array(
						'required'          => true,
						'sanitize_callback' => 'sanitize_text_field',
					),
				),
			)
		);

		register_rest_route(
			self::REST_NS,
			'/check-user',
			array(
				'methods'             => 'GET',
				'permission_callback' => $permission,
				'callback'            => array( __CLASS__, 'rest_check_user' ),
				'args'                => array(
					'user_id' => array(
						'required' => true,
						'sanitize_callback' => 'absint',
					),
				),
			)
		);
	}

	/**
	 * permission_callback: only an already-authenticated wp-admin user with
	 * manage_options may call these endpoints (Application Passwords satisfy
	 * this over REST).
	 */
	public static function require_connector() {
		return current_user_can( 'manage_options' );
	}

	/**
	 * POST /wp-json/tv-portfolio-auth/v1/authenticate
	 *
	 * Validates a login (username or email) + password against the native
	 * WordPress user system. Always returns the SAME generic error for any
	 * failure so the existence of a given account can never be probed.
	 */
	public static function rest_authenticate( WP_REST_Request $request ) {
		if ( self::rate_limited() ) {
			return new WP_Error(
				'tv_portfolio_auth_too_many',
				__( 'Too many attempts. Please try again later.', 'tv-portfolio-auth' ),
				array( 'status' => 429 )
			);
		}

		$login    = trim( (string) $request->get_param( 'login' ) );
		$password = (string) $request->get_param( 'password' );

		if ( '' === $login || '' === $password ) {
			self::rate_hit();
			return self::deny();
		}

		// Native WordPress authentication: native password hashing, account
		// state (disabled/deleted), and native filters all apply. No second
		// password store is ever created.
		$user = wp_authenticate( $login, $password );

		if ( is_wp_error( $user ) || ! ( $user instanceof WP_User ) ) {
			self::rate_hit();
			return self::deny();
		}

		// Authorization: the authenticated account must explicitly hold the
		// tv_portfolio_access capability (granted per-user in the admin UI).
		// Without it the credentials are rejected with the same generic error.
		if ( ! user_can( $user, self::CAP ) ) {
			self::rate_hit();
			return self::deny();
		}

		self::rate_clear();

		return new WP_REST_Response(
			array(
				'user_id'      => $user->ID,
				'display_name' => $user->display_name,
				'user_email'   => $user->user_email,
			),
			200
		);
	}

	/**
	 * GET /wp-json/tv-portfolio-auth/v1/check-user?user_id=…
	 *
	 * Lets the portfolio backend re-validate a session: the user must still
	 * exist AND still hold tv_portfolio_access.
	 */
	public static function rest_check_user( WP_REST_Request $request ) {
		$user_id = (int) $request->get_param( 'user_id' );
		$user    = $user_id > 0 ? get_user_by( 'id', $user_id ) : false;

		return new WP_REST_Response(
			array(
				'allowed' => $user instanceof WP_User && user_can( $user, self::CAP ),
			),
			200
		);
	}

	/**
	 * Generic, non-informative 401.
	 */
	private static function deny() {
		return new WP_Error(
			'tv_portfolio_auth_invalid_credentials',
			__( 'Invalid credentials.', 'tv-portfolio-auth' ),
			array( 'status' => 401 )
		);
	}

	/**
	 * Register the admin settings page.
	 */
	public static function admin_menu() {
		add_users_page(
			__( 'Portfolio Access', 'tv-portfolio-auth' ),
			__( 'Portfolio Access', 'tv-portfolio-auth' ),
			'manage_options',
			'tv-portfolio-auth',
			array( __CLASS__, 'render_admin_page' )
		);
	}

	/**
	 * Admin page: choose which WordPress users may access the private area.
	 */
	public static function render_admin_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to access this page.', 'tv-portfolio-auth' ) );
		}

		$args   = array( 'blog_id' => get_current_blog_id() );
		$users  = get_users( $args );
		$save   = filter_input( INPUT_GET, 'saved', FILTER_VALIDATE_INT );
		$nonce  = wp_create_nonce( 'tv_portfolio_auth_save' );

		?>
		<div class="wrap">
			<h1><?php echo esc_html__( 'Portfolio Access', 'tv-portfolio-auth' ); ?></h1>
			<p>
				<?php echo esc_html__( 'Mark the WordPress users allowed to sign in to the portfolio private area. Access is enforced server-side by the capability', 'tv-portfolio-auth' ); ?>
				<code>tv_portfolio_access</code>.
			</p>
			<p class="description">
				<?php echo esc_html__( 'Changing the authorized account later requires no code change to the portfolio.', 'tv-portfolio-auth' ); ?>
			</p>

			<?php if ( 1 === $save ) : ?>
				<div class="notice notice-success is-dismissible"><p><?php echo esc_html__( 'Settings saved.', 'tv-portfolio-auth' ); ?></p></div>
			<?php endif; ?>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="tv_portfolio_auth_save">
				<input type="hidden" name="_wpnonce" value="<?php echo esc_attr( $nonce ); ?>">

				<table class="widefat striped" style="max-width: 640px;">
					<thead>
						<tr>
							<th style="width: 40px;"><?php echo esc_html__( 'Access', 'tv-portfolio-auth' ); ?></th>
							<th><?php echo esc_html__( 'User', 'tv-portfolio-auth' ); ?></th>
							<th><?php echo esc_html__( 'Role', 'tv-portfolio-auth' ); ?></th>
						</tr>
					</thead>
					<tbody>
						<?php foreach ( $users as $user ) : ?>
							<tr>
								<td>
									<input
										type="checkbox"
										name="granted_users[]"
										value="<?php echo esc_attr( $user->ID ); ?>"
										<?php checked( user_can( $user, self::CAP ) ); ?>
									>
								</td>
								<td>
									<strong><?php echo esc_html( $user->display_name ); ?></strong>
									<code><?php echo esc_html( $user->user_login ); ?></code>
								</td>
								<td><?php echo esc_html( implode( ', ', maybe_unserialize( $user->roles ) ?: array() ) ); ?></td>
							</tr>
						<?php endforeach; ?>
					</tbody>
				</table>

				<p class="submit">
					<button type="submit" class="button button-primary">
						<?php echo esc_html__( 'Save', 'tv-portfolio-auth' ); ?>
					</button>
				</p>
			</form>

			<hr>
			<h2><?php echo esc_html__( 'Connector account (backend → WordPress)', 'tv-portfolio-auth' ); ?></h2>
			<p>
				<?php echo esc_html__( 'The portfolio backend reaches these endpoints using an Application Password of a user with the "administrator" role (manage_options). Create it under Users → Profile → Application Passwords and export it as WORDPRESS_CONNECT_USER / WORDPRESS_CONNECT_APP_PASSWORD.', 'tv-portfolio-auth' ); ?>
			</p>
		</div>
		<?php
	}

	/**
	 * Handle the admin form submission via admin-post.php (check_admin_referer
	 * provides CSRF protection on this server-rendered admin page).
	 */
	public static function handle_save() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to access this page.', 'tv-portfolio-auth' ) );
		}
		check_admin_referer( 'tv_portfolio_auth_save' );

		$granted_ids = array_map( 'absint', (array) filter_input( INPUT_POST, 'granted_users', FILTER_DEFAULT, FILTER_REQUIRE_ARRAY ) );
		$granted_ids = array_flip( $granted_ids );

		foreach ( get_users( array( 'blog_id' => get_current_blog_id() ) ) as $user ) {
			if ( isset( $granted_ids[ $user->ID ] ) ) {
				$user->add_cap( self::CAP );
			} else {
				$user->remove_cap( self::CAP );
			}
		}

		wp_safe_redirect(
			add_query_arg(
				array( 'page' => 'tv-portfolio-auth', 'saved' => 1 ),
				admin_url( 'users.php' )
			)
		);
		exit;
	}

	/**
	 * Add a shortcut to the settings page from the plugins list.
	 */
	public static function action_links( $links ) {
		$links[] = sprintf(
			'<a href="%s">%s</a>',
			esc_url( admin_url( 'users.php?page=tv-portfolio-auth' ) ),
			esc_html__( 'Portfolio Access', 'tv-portfolio-auth' )
		);
		return $links;
	}
}

TV_Portfolio_Auth::init();