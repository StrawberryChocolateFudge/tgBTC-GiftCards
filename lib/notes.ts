
//@ts-nocheck
import { utils } from "ffjavascript";
import {poseidon1,poseidon2 } from "poseidon-bls12381";

import { groth16 } from "snarkjs"
import crypto from "crypto";

export function rbigint(): bigint { return utils.leBuff2int(crypto.randomBytes(31)) };


// Generates the proofs for verification! 
export async function generateNoteWithdrawProof({ deposit, recipient, snarkArtifacts }) {
    console.log("Generate proof start");
    const input = {
        nullifierHash: deposit.nullifierHash,
        commitmentHash: deposit.commitment,
        recipient,
        // private snark inputs
        nullifier: deposit.nullifier,
        secret: deposit.secret
    }


    if (!snarkArtifacts) {
        snarkArtifacts = {
            wasmFilePath: `circuits/circuit_js/circuit.wasm`,
            zkeyFilePath: `circuits/circuit_final.zkey`
        }
    }

    console.time("Proof Time");

    const { proof, publicSignals } = await groth16.fullProve(input, snarkArtifacts.wasmFilePath, snarkArtifacts.zkeyFilePath)
    console.timeEnd("Proof Time");

    return { proof, publicSignals }
}

/**
 * Verifies a SnarkJS proof.
 * @param verificationKey The zero-knowledge verification key.
 * @param fullProof The SnarkJS full proof.
 * @returns True if the proof is valid, false otherwise.
 */

export function verifyThreePublicSignals(verificationKey, { proof, publicSignals }) {
    return groth16.verify(
        verificationKey,
        [
            publicSignals[0],
            publicSignals[1],
            publicSignals[2]
        ],
        proof
    )
}



export function generateCommitmentHash(nullifier, secret) {
    return poseidon2([BigInt(nullifier), BigInt(secret)]);
}

export function generateNullifierHash(nullifier) {
    return poseidon1([BigInt(nullifier)])
}

export async function deposit({ currency, amount }) {
    const deposit = await createDeposit({ nullifier: rbigint(), secret: rbigint() });
    const note = toNoteHex(deposit.preimage, 62);
    const noteString = `note-${currency}-${amount}-${note}`
    return noteString;
}

/**
 * Create deposit object from secret and nullifier
   NOTE: Do not run this function to create notes on higher level.
   Rely on "deposit" function instead
*/
async function createDeposit({ nullifier, secret }) {
    const deposit = {
        nullifier,
        secret,
        preimage: Buffer.concat([utils.leInt2Buff(nullifier, 31), utils.leInt2Buff(secret, 31)]),
        commitment: await generateCommitmentHash(nullifier, secret),
        nullifierHash: await generateNullifierHash(nullifier)
    }
    return deposit
}

/** BigNumber to hex string of specified length */
export function toNoteHex(number, length = 32) {
    const str = number instanceof Buffer ? number.toString('hex') : bigInt(number).toString(16)
    return '0x' + str.padStart(length * 2, '0')
}


export async function parseNote(noteString) {
    const noteRegex = /note-(?<currency>\w+)-(?<amount>[\d.]+)-0x(?<note>[0-9a-fA-F]{124})/g
    const match = noteRegex.exec(noteString);
    if (!match) {
        throw new Error("Invalid Note!")
    }
    //@ts-ignore
    const buf = Buffer.from(match.groups.note, 'hex');
    const nullifier = utils.leBuff2int(buf.slice(0, 31));
    const secret = utils.leBuff2int(buf.slice(31, 62));
    const deposit = await createDeposit({ nullifier, secret });
    //@ts-ignore
    const netId = Number(match.groups.netId);
    //@ts-ignore
    return { currency: match.groups.currency, amount: match.groups.amount, netId, deposit }
}