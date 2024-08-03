import Crypto, { type CipherKey, type CipherGCMTypes } from "node:crypto";
import type Server from "./server";

class Crypt {
	server: Server;
	constructor(app: Server) {
		this.server = app;
	}

	decrypt(encodedString: string) {
		const encoded = JSON.parse(Crypt.base64decode(encodedString));

		encoded.iv = Crypt.base64decode(encoded.iv);
		encoded.value = Crypt.base64decode(encoded.value, "binary");

		const decipher = Crypto.createDecipheriv(
			this.server.clientOptions.crypt.cypher as CipherGCMTypes,
			this.server.clientOptions.crypt.key as CipherKey,
			encoded.iv,
		);

		let decrypted = decipher.update(encoded.value, "binary", "ascii");
		decrypted += decipher.final("ascii");

		return JSON.parse(decrypted);
	}

	static base64decode(string: string, mode?: BufferEncoding) {
		return Buffer.from(string, "base64").toString(mode || "ascii");
	}
}

export default Crypt;
