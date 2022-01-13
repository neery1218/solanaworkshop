import {
  Connection,
  sendAndConfirmTransaction,
  Keypair,
  Transaction,
  SystemProgram,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";

import BN from "bn.js";
import { readFile } from "mz/fs.js";

const instrAuthorizedEcho = (
  authorizedBuffer: PublicKey,
  authority: Keypair,
  echo: string,
  programId: PublicKey
): [TransactionInstruction, Array<Keypair>] => {
  const idx = Buffer.from(new Uint8Array([2]));
  const echoLen = Buffer.from(new BN(echo.length).toArray("le", 4));
  const echoBuffer = Buffer.from(echo);

  const data = Buffer.concat([idx, echoLen, echoBuffer]);
  console.log(`Authorizedecho: Data is ${data.toString("hex")}`);

  return [
    new TransactionInstruction({
      keys: [
        {
          pubkey: authorizedBuffer,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: authority.publicKey,
          isSigner: true,
          isWritable: false,
        },
      ],
      data: data,
      programId: programId,
    }),
    [authority],
  ];
};

const instrInitializeAuthorizedEcho = (
  authorizedBuffer: PublicKey,
  authority: Keypair,
  buffer_seed: Buffer,
  _buffer_size: number,
  programId: PublicKey
): [TransactionInstruction, Array<Keypair>] => {
  const idx = Buffer.from(new Uint8Array([1]));
  const buffer_size = Buffer.from(
    new Uint8Array(new BN(_buffer_size).toArray("le", 8))
  );
  console.log(
    `Buffer size was ${_buffer_size} and is now: ${buffer_size.toString("hex")}`
  );
  const data = Buffer.concat([idx, buffer_seed, buffer_size]);
  console.log(`Data is ${data.toString("hex")}`);

  return [
    new TransactionInstruction({
      keys: [
        {
          pubkey: authorizedBuffer,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: authority.publicKey,
          isSigner: true,
          isWritable: true,
        },
        {
          pubkey: SystemProgram.programId,
          isSigner: false,
          isWritable: true,
        },
      ],
      data: data,
      programId: programId,
    }),
    [authority],
  ];
};

const main = async () => {
  // usage: ./index.ts programId echoValue
  console.log("Hello");
  var args = process.argv.slice(2);
  if (args.length != 2) {
    console.log("Supply args pls.");
    return;
  }

  console.log(args);
  const programId = new PublicKey(args[0]);
  const echo = args[1];

  const secretKeyString = await readFile(
    "/Users/neerajensritharan/.config/solana/id.json",
    {
      encoding: "utf8",
    }
  );

  console.log("Loaded Keypair from ", args[1]);
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  const authority = Keypair.fromSecretKey(secretKey);
  console.log(`authority derived pubkey is: ${authority.publicKey}`);

  // const connection = new Connection("http://127.0.0.1:8899");
  const connection = new Connection("https://api.devnet.solana.com");

  console.log("Requesting Airdrop of 1 SOL...");
  await connection.requestAirdrop(authority.publicKey, 2e9);
  console.log("Airdrop received");

  // create random buffer seed
  const buffer_seed = Buffer.alloc(8, 3);

  // create address
  const [authority_buffer, bump_seed] = await PublicKey.findProgramAddress(
    [
      Buffer.from("authority", "ascii"),
      authority.publicKey.toBuffer(),
      buffer_seed,
    ],
    programId
  );
  console.log(`buffer pubkey is: ${authority_buffer}`);
  console.log(`authority bump seed is: ${bump_seed}`);

  let tx = new Transaction();
  let signers: Array<Keypair> = new Array<Keypair>();

  {
    const [ti, ti_signers] = instrInitializeAuthorizedEcho(
      authority_buffer,
      authority,
      buffer_seed,
      echo.length + 9,
      programId
    );

    tx.add(ti);
    signers.push(...ti_signers);
  }

  {
    const [ti, _] = instrAuthorizedEcho(
      authority_buffer,
      authority,
      echo,
      programId
    );
    tx.add(ti);
    // signers.push(...ti_signers);
  }

  console.log("Sending transaction...");
  let txid = await sendAndConfirmTransaction(connection, tx, signers, {
    skipPreflight: true,
    preflightCommitment: "confirmed",
  });

  console.log(`https://explorer.solana.com/tx/${txid}?cluster=devnet`);
  console.log(`Tx: ${txid}`);

  const data = (await connection.getAccountInfo(authority_buffer)).data;
  console.log("Echo Buffer Text:", data.slice(9).toString());
};

main()
  .then(() => {
    console.log("Success");
  })
  .catch((e) => {
    console.error(e);
  });
