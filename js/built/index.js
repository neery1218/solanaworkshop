"use strict";
const { Connection, sendAndConfirmTransaction, Keypair, Transaction, SystemProgram, PublicKey, TransactionInstruction, } = require("@solana/web3.js");
const BN = require("bn.js");
const instrInitializeAuthorizedEcho = (authorizedBuffer, authority, buffer_seed, buffer_size) => {
    return new TransactionInstruction({
        keys: [
            {
                pubkey: authorizedBuffer,
                isSigner: false,
                isWritable: true,
            },
            {
                pubkey: authority,
                isSigner: true,
                isWritable: true,
            },
            {
                pubkey: SystemProgram.programId,
                isSigner: false,
                isWritable: true,
            },
        ],
        data: Buffer.from(new Uint8Array([buffer_seed, buffer_size])),
        programId: programId,
    });
};
const main = async () => {
    var args = process.argv.slice(2);
    console.log(args);
    const programId = new PublicKey(args[0]);
    const echo = args[1];
    const connection = new Connection("http://127.0.0.1:8899");
    // const connection = new Connection("https://api.devnet.solana.com");
    const feePayer = new Keypair();
    const echoBuffer = new Keypair();
    let signers = [feePayer];
    let echoBufferKey = echoBuffer.publicKey;
    let tx = new Transaction();
    console.log("Requesting Airdrop of 1 SOL...");
    await connection.requestAirdrop(feePayer.publicKey, 2e9);
    console.log("Airdrop received");
    if (args.length > 2) {
        console.log("Found counter address");
        echoBufferKey = new PublicKey(args[2]);
    }
    else {
        let createIx = SystemProgram.createAccount({
            fromPubkey: feePayer.publicKey,
            newAccountPubkey: echoBufferKey,
            /** Amount of lamports to transfer to the created account */
            lamports: await connection.getMinimumBalanceForRentExemption(echo.length),
            /** Amount of space in bytes to allocate to the created account */
            space: echo.length,
            /** Public key of the program to assign as the owner of the created account */
            programId: programId,
        });
        tx.add(createIx);
        signers.push(echoBuffer);
    }
    console.log(`Echo buffer pubkey: ${echoBufferKey}`);
    const idx = Buffer.from(new Uint8Array([0]));
    const messageLen = Buffer.from(new Uint8Array(new BN(echo.length).toArray("le", 4)));
    const message = Buffer.from(echo, "ascii");
    let echoIx = new TransactionInstruction({
        keys: [
            {
                pubkey: echoBufferKey,
                isSigner: false,
                isWritable: true,
            },
        ],
        programId: programId,
        data: Buffer.concat([idx, messageLen, message]),
    });
    tx.add(echoIx);
    console.log("Sending transaction...");
    let txid = await sendAndConfirmTransaction(connection, tx, signers, {
        skipPreflight: true,
        preflightCommitment: "confirmed",
        confirmation: "confirmed",
    });
    console.log(`https://explorer.solana.com/tx/${txid}?cluster=devnet`);
    data = (await connection.getAccountInfo(echoBufferKey)).data;
    console.log("Echo Buffer Text:", data.toString());
};
main()
    .then(() => {
    console.log("Success");
})
    .catch((e) => {
    console.error(e);
});
