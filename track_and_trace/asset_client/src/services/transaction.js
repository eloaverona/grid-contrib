const m = require('mithril')
const { createHash } = require('crypto')
const { Transaction, TransactionHeader, Batch, BatchHeader, BatchList } = require('sawtooth-sdk/protobuf')

const addressing = require('../utils/addressing')

const createTransaction = (payloadInfo, signer, family) => {
    let { payloadBytes, inputs, outputs } = payloadInfo
    let pubkey = signer.getPublicKey().asHex()
    
    switch (family) {
        case 'pike':
            family = addressing.pikeFamily
            break
        case 'tnt':
            family = addressing.tntFamily
            break
        default:
            family = addressing.tntFamily
    }
    
    const transactionHeaderBytes = TransactionHeader.encode({
        familyName: family.name,
        familyVersion: family.version,
        inputs,
        outputs,
        signerPublicKey: pubkey,
        batcherPublicKey: pubkey,
        dependencies: [],
        payloadSha512: createHash('sha512').update(payloadBytes).digest('hex')
    }).finish()

    let signature = signer.sign(transactionHeaderBytes)

    return Transaction.create({
        header: transactionHeaderBytes,
        headerSignature: signature,
        payload: payloadBytes
    })
}

const submitBatch = (transactions, signer) => {
    let transactionIds = transactions.map((txn) => txn.headerSignature)
    let pubkey = signer.getPublicKey().asHex()

    const batchHeaderBytes = BatchHeader.encode({
        signerPublicKey: pubkey,
        transactionIds,
    }).finish()

    let signature = signer.sign(batchHeaderBytes)

    const batch = Batch.create({
        header: batchHeaderBytes,
        headerSignature: signature,
        transactions
    })

    const batchListBytes = BatchList.encode({
        batches: [batch]
    }).finish()

    return m.request({
        method: 'POST',
        url: '/grid/batches',
        data: batchListBytes,
        headers: { "Content-Type": "application/octet-stream" },
        serialize: x => x
    })
        .then((result) =>
            _waitForCommit(
                transactionIds, _formStatusUrl(result.link)
            )
        )
}

const submitTransaction = (payloadInfo, signer) => {
    const transactions = [createTransaction(payloadInfo, signer)]
    return submitBatch(transactions, signer)
}

const _formStatusUrl = (url) => {
    let qs = m.parseQueryString(/(id=)\w+/g.exec(url)[0])
    let id = (qs.id ? `id=${qs.id}` : '')
    return `/grid/batch_statuses?${id}`
}

const _waitForCommit = (transactionIds, statusUrl) => 
    m.request({
        url: `${_formStatusUrl(statusUrl)}&wait=60`,
        method: 'GET'
    })
        .catch((e) => Promise.reject(e.message))
        .then((result) => {
            let batch_result = result.data[0]
            if (batch_result.status === 'COMMITTED') {
                return Promise.resolve(transactionIds)
            } else if (batch_result.status === 'INVALID') {
                let transaction_result = batch_result.invalid_transactions.find((txn) => transactionIds.includes(txn.id))
                if (transaction_result) {
                    return Promise.reject(transaction_result.message)
                } else {
                    return Promise.reject('Invalid Transaction')
                }
            } else {
                return _waitForCommit(transactionIds, statusUrl)
            }
        })

module.exports = {
    submitBatch,
    submitTransaction,
    createTransaction,
}