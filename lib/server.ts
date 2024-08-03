import { EventEmitter } from "node:events";
import DeepExtend from "deep-extend";
import Ws from "ws";

import type { IncomingMessage } from "node:http";
import ClientConnection from "./connection";
import type { LOGLEVEL } from "./enums";
import type { Callback, ClientOptions, GuacdOptions } from "./types";

class Server extends EventEmitter {
	wsOptions: Ws.ServerOptions;
	LOGLEVEL: typeof LOGLEVEL;
	guacdOptions: GuacdOptions;
	clientOptions: ClientOptions;
	callbacks: Callback;
	connectionsCount: number;
	activeConnections: Map<number, ClientConnection>;
	webSocketServer: Ws.WebSocketServer;
	constructor(
		wsOptions: Ws.ServerOptions,
		guacdOptions: GuacdOptions,
		clientOptions: Omit<ClientOptions, "connectionDefaultSettings">,
		callbacks?: Callback,
	) {
		super();

		this.LOGLEVEL = {
			QUIET: 0,
			ERRORS: 10,
			NORMAL: 20,
			VERBOSE: 30,
			DEBUG: 40,
		};

		if (Object.hasOwn(wsOptions, "server") || wsOptions.noServer) {
			this.wsOptions = wsOptions;
		} else {
			this.wsOptions = Object.assign(
				{
					port: 8080,
				},
				wsOptions,
			);
		}

		this.guacdOptions = Object.assign(
			{
				host: "127.0.0.1",
				port: 4822,
			} satisfies GuacdOptions,
			guacdOptions,
		);
		// @ts-expect-error here for other reasons
		this.clientOptions = {};
		DeepExtend(
			this.clientOptions,
			{
				maxInactivityTime: 10000,

				log: {
					level: this.LOGLEVEL.VERBOSE,
					stdLog: console.log,
					errorLog: console.error,
				},

				crypt: {
					cypher: "aes-256-ccm",
				},

				connectionDefaultSettings: {
					rdp: {
						args: "connect",
						port: "3389",
						width: 1024,
						height: 768,
						dpi: 96,
					},
					vnc: {
						args: "connect",
						port: "5900",
						width: 1024,
						height: 768,
						dpi: 96,
					},
					ssh: {
						args: "connect",
						port: 22,
						width: 1024,
						height: 768,
						dpi: 96,
					},
					telnet: {
						args: "connect",
						port: 23,
						width: 1024,
						height: 768,
						dpi: 96,
					},
				},

				allowedUnencryptedConnectionSettings: {
					rdp: ["width", "height", "dpi"],
					vnc: ["width", "height", "dpi"],
					ssh: ["color-scheme", "font-name", "font-size", "width", "height", "dpi"],
					telnet: ["color-scheme", "font-name", "font-size", "width", "height", "dpi"],
					kubernetes: ["width", "height", "dpi"],
				},
			} satisfies ClientOptions,
			clientOptions,
		);

		this.callbacks = Object.assign(
			{
				processConnectionSettings: (settings, callback) => callback(undefined, settings),
			} satisfies Callback,
			callbacks,
		);

		this.connectionsCount = 0;
		this.activeConnections = new Map();

		if (!this.clientOptions.log?.level || this.clientOptions.log.level >= this.LOGLEVEL.NORMAL) {
			this.clientOptions.log?.stdLog?.("Starting guacamole-lite websocket server");
		}

		this.webSocketServer = new Ws.Server(this.wsOptions);
		this.webSocketServer.on("connection", this.newConnection.bind(this));
		if (Object.hasOwn(wsOptions, "server") || wsOptions.noServer) {
			process.on("SIGTERM", this.close.bind(this));
			process.on("SIGINT", this.close.bind(this));
		}
	}

	close() {
		if (!this.clientOptions.log?.level || this.clientOptions.log.level >= this.LOGLEVEL.NORMAL) {
			this.clientOptions.log?.stdLog?.("Closing all connections and exiting...");
		}
		for (const [, activeConnection] of this.activeConnections) {
			activeConnection.close();
		}
		this.webSocketServer.close();
	}

	newConnection(webSocketConnection: Ws, upgradeRequest: IncomingMessage) {
		this.connectionsCount++;
		this.activeConnections.set(
			this.connectionsCount,
			new ClientConnection(this, this.connectionsCount, webSocketConnection, upgradeRequest),
		);
	}
	get wsServer() {
		return this.webSocketServer;
	}
}

export default Server;
