import type { CipherCCMTypes, CipherGCMTypes, CipherKey } from "node:crypto";

export enum LOGLEVEL {
	QUIET = 0,
	ERRORS = 10,
	NORMAL = 20,
	VERBOSE = 30,
	DEBUG = 40,
}
export type Callback = {
	[key: string]: (settings: ConnectionSettings, callback: (err: unknown, settings: ConnectionSettings) => void) => void;
};
export interface ConnectionSettings {
	connection: ClientOptions["connectionDefaultSettings"][ConnectionType] & {
		type: ConnectionType;
		settings: ClientOptions["connectionDefaultSettings"][ConnectionType];
	};
}
export type ConnectionType = "rdp" | "vnc" | "ssh" | "telnet" | "kubernetes";

export interface GuacdOptions {
	host: string;
	port: number;
}
interface BaseProtOptions {
	args?: string;
	hostname?: string;
	port?: number | string;
	width?: number;
	height?: number;
	dpi?: number;
	[key: string]: unknown;
}
export interface ClientOptions {
	maxInactivityTime: number;

	/**
	 * Encryption settings used to decrypt the connection token.
	 * Ideally, you'd want to keep them in a separate file and not commit them to your repository.
	 */
	crypt: {
		cypher: CipherCCMTypes | CipherGCMTypes;
		key?: CipherKey;
	};

	/**
	 * Logger settings.
	 */
	log?: {
		/**
		 * You can set the log level to one of the following values:
		 * 'QUIET' - no logs
		 * 'ERRORS' - only errors
		 * 'NORMAL' - errors + minimal logs (startup and shutdown messages)
		 * 'VERBOSE' - (default) normal + connection messages (opened, closed, guacd exchange, etc)
		 * 'DEBUG' - verbose + all OPCODES sent/received within guacamole sessions
		 */
		level: LOGLEVEL;

		/**
		 * By default, GuacamoleLite will log to stdout and stderr.
		 * You can override the default logging functions by providing your own stdLog and/or errorLog functions.
		 */
		stdLog?: (...args: string[]) => void;
		errorLog?: (...args: string[]) => void;
	};

	/**
	 * Default settings for different connection types.
	 * These are added to the connection settings received from the client in the encrypted connection token.
	 * Note that this is a mix of connection parameters and client handshake instructions.
	 * There is no common set of parameters for all connection types (RDP, VNC, etc.), each type must be configured
	 * separately.
	 * For the list of connection parameters
	 * see https://guacamole.incubator.apache.org/doc/gug/configuring-guacamole.html#configuring-connections
	 * For the list of client handshake instructions
	 * see https://guacamole.incubator.apache.org/doc/gug/protocol-reference.html#client-handshake-instructions
	 */
	connectionDefaultSettings: {
		/**
		 * RDP connection parameters
		 * https://guacamole.incubator.apache.org/doc/gug/configuring-guacamole.html#rdp
		 * https://guacamole.incubator.apache.org/doc/gug/configuring-guacamole.html#common-configuration-options
		 */
		rdp?: BaseProtOptions & {
			username?: string;
			password?: string;
			domain?: string;
			security?: string;
			"create-drive-path"?: boolean;
			"ignore-cert"?: boolean;
			"enable-wallpaper"?: boolean;
			"create-recording-path"?: boolean;

			/**
			 * Client handshake instructions
			 * https://guacamole.incubator.apache.org/doc/gug/protocol-reference.html#client-handshake-instructions
			 */
			audio?: string[];
			video?: string[];
			image?: string[];
			timezone?: string;
		};
		vnc?: BaseProtOptions & {
			/**
			 * VNC connection parameters
			 * https://guacamole.incubator.apache.org/doc/gug/configuring-guacamole.html#vnc
			 * https://guacamole.incubator.apache.org/doc/gug/configuring-guacamole.html#common-configuration-options
			 */
			"swap-red-blue"?: boolean;
			"disable-paste"?: false;
		};
		ssh?: BaseProtOptions & {
			/**
			 * SSH connection parameters
			 * https://guacamole.incubator.apache.org/doc/gug/configuring-guacamole.html#ssh
			 * https://guacamole.incubator.apache.org/doc/gug/configuring-guacamole.html#common-configuration-options
			 */
			"enable-sftp"?: boolean;
			"green-black"?: boolean;
		};
		telnet?: BaseProtOptions & {
			/**
			 * Telnet connection parameters
			 * https://guacamole.incubator.apache.org/doc/gug/configuring-guacamole.html#telnet
			 * https://guacamole.incubator.apache.org/doc/gug/configuring-guacamole.html#common-configuration-options
			 */
			"login-success-regex"?: string;
		};
		kubernetes?: BaseProtOptions & {
			/**
			 * Kubernetes connection parameters
			 * https://guacamole.incubator.apache.org/doc/gug/configuring-guacamole.html#kubernetes
			 * https://guacamole.incubator.apache.org/doc/gug/configuring-guacamole.html#common-configuration-options
			 */
			"exec-command"?: string;
			namespace?: string;
			pod: string;
			container?: string;
			port?: string;
		};
	};

	/**
	 * The connection parameters from the encrypted token can be overridden by the client by sending them
	 * unencrypted in the query string.
	 * For example: ws://guacamole-lite:8080/?token=<encrypted>&width=800&height=600&dpi=120
	 *
	 * This is useful when you want to generate a connection token on your backend server (which is a good idea,
	 * because you don't want to expose connection parameters like username, password, etc to the client), but
	 * allow your frontend to override some of the connection parameters like screen width, height, etc.
	 *
	 * Because we don't want the client to be able to override all parameters, including the sensitive ones,
	 * we need to specify the list parameters that can be sent unencrypted for each connection type.
	 *
	 * By default, only the following unencrypted parameters are allowed:
	 * width, height, dpi, audio, video, image, timezone
	 */
	allowedUnencryptedConnectionSettings?: Record<ConnectionType, string[]>;
}
