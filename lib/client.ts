import Net from "node:net";
import type ClientConnection from "./connection";
import type Server from "./server";
import type { LOGLEVEL } from "./types";
class GuacdClient {
	STATE_OPENING: number;
	STATE_OPEN: number;
	STATE_CLOSED: number;
	state: number;
	server: Server;
	clientConnection: ClientConnection;
	handshakeReplySent: boolean;
	receivedBuffer: string;
	lastActivity: number;
	guacdConnection: Net.Socket;
	activityCheckInterval: NodeJS.Timeout;
	constructor(server: Server, clientConnection: ClientConnection) {
		this.STATE_OPENING = 0;
		this.STATE_OPEN = 1;
		this.STATE_CLOSED = 2;

		this.state = this.STATE_OPENING;

		this.server = server;
		this.clientConnection = clientConnection;
		this.handshakeReplySent = false;
		this.receivedBuffer = "";
		this.lastActivity = Date.now();

		this.guacdConnection = Net.connect(server.guacdOptions.port, server.guacdOptions.host);

		this.guacdConnection.on("connect", this.processConnectionOpen.bind(this));
		this.guacdConnection.on("data", this.processReceivedData.bind(this));
		this.guacdConnection.on("close", this.clientConnection.close.bind(this.clientConnection));
		this.guacdConnection.on("error", this.clientConnection.error.bind(this.clientConnection));

		this.activityCheckInterval = setInterval(this.checkActivity.bind(this), 1000);
	}

	checkActivity() {
		if (Date.now() > this.lastActivity + 10000) {
			this.clientConnection.close(new Error("guacd was inactive for too long"));
		}
	}

	close(error?: Error) {
		if (this.state === this.STATE_CLOSED) {
			return;
		}

		if (error) {
			this.clientConnection.log(this.server.LOGLEVEL.ERRORS, error.message);
		}

		this.log(this.server.LOGLEVEL.VERBOSE, "Closing guacd connection");
		clearInterval(this.activityCheckInterval);

		this.guacdConnection.removeAllListeners("close");
		this.guacdConnection.end();
		this.guacdConnection.destroy();

		this.state = this.STATE_CLOSED;
		this.server.emit("close", this.clientConnection);
	}

	send(data: Uint8Array | string) {
		if (this.state === this.STATE_CLOSED) {
			return;
		}

		this.log(this.server.LOGLEVEL.DEBUG, `<<<W2G< ${data}***`);
		this.guacdConnection.write(data);
	}

	log(level: LOGLEVEL, ...args: string[]) {
		this.clientConnection.log(level, ...args);
	}

	processConnectionOpen() {
		this.log(this.server.LOGLEVEL.VERBOSE, "guacd connection open");

		this.log(this.server.LOGLEVEL.VERBOSE, `Selecting connection type: ${this.clientConnection.connectionType}`);
		this.sendOpCode(["select", this.clientConnection.connectionType || ""]);
	}

	sendHandshakeReply() {
		this.sendOpCode([
			"size",
			this.clientConnection.connectionSettings?.connection.width?.toString() as string,
			this.clientConnection.connectionSettings?.connection.height?.toString() as string,
			this.clientConnection.connectionSettings?.connection.dpi?.toString() as string,
		]);
		this.sendOpCode(["audio"].concat(this.clientConnection.query.GUAC_AUDIO || []));
		this.sendOpCode(["video"].concat(this.clientConnection.query.GUAC_VIDEO || []));
		this.sendOpCode(["image"]);

		let serverHandshake: string[] | string = this.getFirstOpCodeFromBuffer();

		this.log(this.server.LOGLEVEL.VERBOSE, `Server sent handshake: ${serverHandshake}`);

		serverHandshake = serverHandshake.split(",");
		const connectionOptions = [];

		for (const attribute of serverHandshake) {
			connectionOptions.push(this.getConnectionOption(attribute));
		}

		this.sendOpCode(connectionOptions as string[]);

		this.handshakeReplySent = true;

		if (this.state !== this.STATE_OPEN) {
			this.state = this.STATE_OPEN;
			this.server.emit("open", this.clientConnection);
		}
	}

	getConnectionOption(optionName: string) {
		return (
			this.clientConnection.connectionSettings?.connection[
				GuacdClient.parseOpCodeAttribute(optionName) as keyof typeof this.clientConnection.connectionSettings.connection
			] || null
		);
	}

	getFirstOpCodeFromBuffer() {
		const delimiterPos = this.receivedBuffer.indexOf(";");
		const opCode = this.receivedBuffer.substring(0, delimiterPos);

		this.receivedBuffer = this.receivedBuffer.substring(delimiterPos + 1, this.receivedBuffer.length);

		return opCode;
	}

	sendOpCode(opCode: string[]) {
		this.log(this.server.LOGLEVEL.VERBOSE, `Sending opCode: ${opCode}`);
		this.send(GuacdClient.formatOpCode(opCode));
	}

	static formatOpCode(opCodeParts: string[]) {
		for (let part of opCodeParts) {
			part = GuacdClient.stringifyOpCodePart(part);
			opCodeParts[opCodeParts.indexOf(part)] = `${part.length}.${part}`;
		}
		return `${opCodeParts.join(",")};`;
	}

	static stringifyOpCodePart(part: unknown) {
		if (part === null) {
			part = "";
		}

		return String(part);
	}

	static parseOpCodeAttribute(opCodeAttribute: string) {
		return opCodeAttribute.substring(opCodeAttribute.indexOf(".") + 1, opCodeAttribute.length);
	}

	processReceivedData(data: string) {
		this.receivedBuffer += data;
		this.lastActivity = Date.now();

		if (!this.handshakeReplySent) {
			if (this.receivedBuffer.indexOf(";") === -1) {
				return; // incomplete handshake received from guacd. Will wait for the next part
			}
			this.sendHandshakeReply();
		}

		this.sendBufferToWebSocket();
	}

	sendBufferToWebSocket() {
		const delimiterPos = this.receivedBuffer.lastIndexOf(";");
		const bufferPartToSend = this.receivedBuffer.substring(0, delimiterPos + 1);

		if (bufferPartToSend) {
			this.receivedBuffer = this.receivedBuffer.substring(delimiterPos + 1, this.receivedBuffer.length);
			this.clientConnection.send(bufferPartToSend);
		}
	}
}

export default GuacdClient;
