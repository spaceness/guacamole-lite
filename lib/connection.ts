import Url from "node:url";
import DeepExtend from "deep-extend";
import Moment from "moment";

import type { IncomingMessage } from "node:http";
import type { ParsedUrlQuery } from "node:querystring";
import type Websocket from "ws";
import GuacdClient from "./client";
import Crypt from "./crypt";
import type { LOGLEVEL } from "./enums";
import type Server from "./server";
import type { ConnectionSettings, ConnectionType } from "./types";

class ClientConnection {
	STATE_OPEN: number;
	STATE_CLOSED: number;
	state: number;
	server: Server;
	connectionId: number;
	webSocket: Websocket;
	query: ParsedUrlQuery;
	lastActivity: number;
	activityCheckInterval: NodeJS.Timeout | null;
	guacdClient?: GuacdClient;
	connectionSettings?: ConnectionSettings;
	connectionType?: ConnectionType;
	upgradeRequest: IncomingMessage;
	constructor(server: Server, connectionId: number, webSocket: Websocket, upgradeRequest: IncomingMessage) {
		this.STATE_OPEN = 1;
		this.STATE_CLOSED = 2;

		this.state = this.STATE_OPEN;

		this.server = server;
		this.connectionId = connectionId;
		this.webSocket = webSocket;
		this.upgradeRequest = upgradeRequest;
		this.query = Url.parse(this.upgradeRequest.url as string, true).query;
		this.lastActivity = Date.now();
		this.activityCheckInterval = null;

		this.log(this.server.LOGLEVEL.VERBOSE, "Client connection open");

		try {
			this.connectionSettings = this.decryptToken();
			this.connectionType = this.connectionSettings?.connection?.type;

			this.connectionSettings.connection = this.mergeConnectionOptions() as ConnectionSettings["connection"];
		} catch (error) {
			this.log(this.server.LOGLEVEL.ERRORS, "Token validation failed");
			this.close(error as Error);
			return;
		}

		server.callbacks.processConnectionSettings(this.connectionSettings, (err, settings) => {
			if (err) {
				return this.close(err as Error);
			}

			this.connectionSettings = settings;

			this.log(this.server.LOGLEVEL.VERBOSE, "Opening guacd connection");

			this.guacdClient = new GuacdClient(server, this);

			webSocket.on("close", this.close.bind(this));
			webSocket.on("message", this.processReceivedMessage.bind(this));

			if ((server.clientOptions.maxInactivityTime || 10000) > 0) {
				this.activityCheckInterval = setInterval(this.checkActivity.bind(this), 1000);
			}
		});
	}

	decryptToken(): ConnectionSettings {
		const crypt = new Crypt(this.server);

		const encrypted = this.query.token;
		this.query.token = undefined;

		return crypt.decrypt(encrypted as string);
	}

	log(level: LOGLEVEL, ...args: string[]) {
		if (this.server.clientOptions.log?.level && level > this.server.clientOptions.log.level) {
			return;
		}

		const stdLogFunc = this.server.clientOptions.log?.stdLog || console.log;
		const errorLogFunc = this.server.clientOptions.log?.errorLog || console.error;

		let logFunc = stdLogFunc;
		if (level === this.server.LOGLEVEL.ERRORS) {
			logFunc = errorLogFunc;
		}

		logFunc(this.getLogPrefix(), ...args);
	}

	getLogPrefix() {
		return `[${Moment().format("YYYY-MM-DD HH:mm:ss")}] [Connection ${this.connectionId}] `;
	}

	close(error?: Error) {
		if (this.state === this.STATE_CLOSED) {
			return;
		}

		if (this.activityCheckInterval !== undefined && this.activityCheckInterval !== null) {
			clearInterval(this.activityCheckInterval);
		}

		if (error) {
			this.log(this.server.LOGLEVEL.ERRORS, "Closing connection with error: ", error.message);
		}

		if (this.guacdClient) {
			this.guacdClient.close();
		}

		this.webSocket.removeAllListeners("close");
		this.webSocket.close();
		this.server.activeConnections.delete(this.connectionId);

		this.state = this.STATE_CLOSED;

		this.log(this.server.LOGLEVEL.VERBOSE, "Client connection closed");
	}

	error(error?: Error) {
		if (error) {
			this.server.emit("error", this, error);
		}
		this.close(error);
	}

	processReceivedMessage(message: string | Buffer) {
		this.lastActivity = Date.now();
		this.guacdClient?.send(message);
	}

	send(message: string | Buffer) {
		if (this.state === this.STATE_CLOSED) {
			return;
		}

		this.log(this.server.LOGLEVEL.DEBUG, `>>>G2W> ${message}###`);
		this.webSocket.send(message, { binary: false, mask: false }, (error) => {
			if (error) {
				this.close(error);
			}
		});
	}

	mergeConnectionOptions() {
		const unencryptedConnectionSettings: Record<ConnectionType, unknown> = {
			rdp: undefined,
			vnc: undefined,
			ssh: undefined,
			telnet: undefined,
			kubernetes: undefined,
		};

		for (const key of Object.keys(this.query)) {
			if (
				this.server.clientOptions.allowedUnencryptedConnectionSettings?.[
					this.connectionType as ConnectionType
				].includes(key)
			) {
				unencryptedConnectionSettings[key as ConnectionType] = this.query[key];
			}
		}

		const compiledSettings = {};

		DeepExtend(
			compiledSettings,
			this.server.clientOptions?.connectionDefaultSettings?.[this.connectionType as ConnectionType] || {},
			this.connectionSettings?.connection?.settings || {},
			unencryptedConnectionSettings,
		);

		return compiledSettings;
	}

	checkActivity() {
		if (Date.now() > this.lastActivity + (this.server.clientOptions.maxInactivityTime || 10000)) {
			this.close(new Error("WS was inactive for too long"));
		}
	}
}

export default ClientConnection;
