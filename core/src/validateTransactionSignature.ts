import { getAssociatedTokenAddress } from '@solana/spl-token';
import {
    Connection,
    Finality,
    LAMPORTS_PER_SOL,
    PublicKey,
    TransactionResponse,
    TransactionSignature,
} from '@solana/web3.js';
import BigNumber from 'bignumber.js';

export class ValidateTransactionSignatureError extends Error {
    name = 'ValidateTransactionSignatureError';
}

export async function validateTransactionSignature(
    connection: Connection,
    signature: TransactionSignature,
    recipient: PublicKey,
    amount: BigNumber,
    splToken?: PublicKey,
    reference?: PublicKey | PublicKey[],
    finality?: Finality
): Promise<TransactionResponse> {
    const response = await connection.getTransaction(signature, { commitment: finality });
    if (!response) throw new ValidateTransactionSignatureError('not found');
    if (!response.meta) throw new ValidateTransactionSignatureError('missing meta');
    if (response.meta.err) throw response.meta.err;

    let preAmount: BigNumber, postAmount: BigNumber;
    if (!splToken) {
        const accountIndex = response.transaction.message.accountKeys.findIndex((pubkey) => pubkey.equals(recipient));
        if (accountIndex === -1) throw new ValidateTransactionSignatureError('recipient not found');

        preAmount = new BigNumber(response.meta.preBalances[accountIndex]).div(LAMPORTS_PER_SOL);
        postAmount = new BigNumber(response.meta.postBalances[accountIndex]).div(LAMPORTS_PER_SOL);
    } else {
        const recipientATA = await getAssociatedTokenAddress(splToken, recipient);
        const accountIndex = response.transaction.message.accountKeys.findIndex((pubkey) =>
            pubkey.equals(recipientATA)
        );
        if (accountIndex === -1) throw new ValidateTransactionSignatureError('recipient not found');

        const preBalance = response.meta.preTokenBalances?.find((x) => x.accountIndex === accountIndex);
        if (!preBalance?.uiTokenAmount.uiAmountString) throw new ValidateTransactionSignatureError('balance not found');

        const postBalance = response.meta.postTokenBalances?.find((x) => x.accountIndex === accountIndex);
        if (!postBalance?.uiTokenAmount.uiAmountString)
            throw new ValidateTransactionSignatureError('balance not found');

        preAmount = new BigNumber(preBalance.uiTokenAmount.uiAmountString);
        postAmount = new BigNumber(postBalance.uiTokenAmount.uiAmountString);
    }

    if (preAmount.plus(amount).lt(postAmount)) throw new ValidateTransactionSignatureError('amount not transferred');

    if (reference) {
        if (!Array.isArray(reference)) {
            reference = [reference];
        }

        for (const pubkey of reference) {
            if (!response.transaction.message.accountKeys.some((accountKey) => accountKey.equals(pubkey)))
                throw new ValidateTransactionSignatureError('reference not found');
        }
    }

    return response;
}
