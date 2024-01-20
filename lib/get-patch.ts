import net from "net";

function connectToServer() {
  const client = new net.Socket();

  return new Promise<net.Socket>((resolve, reject) => {
    client.connect(12995, "patch.pathofexile.com", function () {
      resolve(client);
    });

    client.on("error", function (err) {
      reject(err);
    });
  });
}

export async function getLastPatch() {
  const client = await connectToServer();

  // Send the byte sequence
  let dataToSend = Buffer.from([1, 6]);
  client.write(dataToSend);

  return new Promise<string>((resolve, reject) => {
    client.on("data", function (data) {
      // Process the received data
      let length = data[34] * 2;
      let str = data.subarray(35, 35 + length).toString("utf16le");
      let patch = str.split("/").filter(Boolean).pop();

      client.destroy(); // Close the connection
      if (patch === undefined) {
        return reject("Patch not found");
      }
      resolve(patch);
    });

    client.on("error", function (err) {
      reject(err);
    });
  });
}
