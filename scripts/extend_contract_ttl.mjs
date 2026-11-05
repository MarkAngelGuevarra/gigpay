// Keeps the GigPayEscrow contract alive on Stellar Testnet.
//
// The contract stores every escrow in its instance storage and never extends its own TTL. When the
// instance (or its Wasm code) reaches its live-until ledger it is archived, and every fund_task /
// approve_task / get_task call fails until it is restored. Any account may pay to extend a TTL, so this
// script uses a throwaway Friendbot-funded fee payer: no team keys needed, nothing about the escrows changes.
//
//   node scripts/extend_contract_ttl.mjs            -> shows days left and simulates the extension (sends nothing)
//   node scripts/extend_contract_ttl.mjs --submit   -> extends instance + Wasm code to the network maximum
//
// Run it at least every two weeks (with the Friday evidence routine is easiest).
import * as S from '@stellar/stellar-sdk';

const CONTRACT_ID = 'CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3';
const rpc = new S.rpc.Server('https://soroban-testnet.stellar.org');
const SECONDS_PER_LEDGER = 5;
const submit = process.argv.includes('--submit');

const instanceKey = new S.Contract(CONTRACT_ID).getFootprint();
const latest = (await rpc.getLatestLedger()).sequence;
const instance = (await rpc.getLedgerEntries(instanceKey)).entries[0];
if (!instance) throw new Error('Contract instance not found: it may already be archived (restore it first).');
const wasmHash = instance.val.contractData().val().instance().executable().wasmHash();
const codeKey = S.xdr.LedgerKey.contractCode(new S.xdr.LedgerKeyContractCode({ hash: wasmHash }));
const code = (await rpc.getLedgerEntries(codeKey)).entries[0];
const days = (until) => (((until - latest) * SECONDS_PER_LEDGER) / 86400).toFixed(1);
console.log(`Instance expires in ${days(instance.liveUntilLedgerSeq)} days (ledger ${instance.liveUntilLedgerSeq}); Wasm code in ${days(code.liveUntilLedgerSeq)} days.`);

// Fee payer: a fresh Testnet account (Friendbot), so no team secret is involved.
const payer = S.Keypair.random();
const fb = await fetch(`https://friendbot.stellar.org?addr=${payer.publicKey()}`);
if (!fb.ok) throw new Error(`Friendbot refused the fee payer (${fb.status}); try again from another network.`);
const account = await rpc.getAccount(payer.publicKey());

// Extend to just under the network's maximum entry TTL. Asking for the maximum itself (or more) is
// rejected on-chain as extendFootprintTtlMalformed, and simulation does not catch it.
const archivalKey = S.xdr.LedgerKey.configSetting(new S.xdr.LedgerKeyConfigSetting({
  configSettingId: S.xdr.ConfigSettingId.configSettingStateArchival()
}));
const maxEntryTtl = (await rpc.getLedgerEntries(archivalKey)).entries[0].val.configSetting().stateArchivalSettings().maxEntryTtl();
const extendTo = maxEntryTtl - 1;
console.log(`Network maximum: ${maxEntryTtl} ledgers (~${((maxEntryTtl * SECONDS_PER_LEDGER) / 86400).toFixed(0)} days). Extending to ${extendTo}.`);
const tx = new S.TransactionBuilder(account, { fee: '1000000', networkPassphrase: S.Networks.TESTNET })
  .setSorobanData(new S.SorobanDataBuilder().setReadOnly([instanceKey, codeKey]).build())
  .addOperation(S.Operation.extendFootprintTtl({ extendTo }))
  .setTimeout(60)
  .build();
const sim = await rpc.simulateTransaction(tx);
if (S.rpc.Api.isSimulationError(sim)) throw new Error(`Simulation failed: ${sim.error}`);
console.log(`Simulation OK (resource fee ${sim.minResourceFee} stroops).`);
if (!submit) {
  console.log('Dry run only. Re-run with --submit to extend.');
  process.exit(0);
}

const prepared = S.rpc.assembleTransaction(tx, sim).build();
prepared.sign(payer);
const sent = await rpc.sendTransaction(prepared);
if (sent.status === 'ERROR') throw new Error(`Submit failed: ${JSON.stringify(sent.errorResult)}`);
let result;
for (let i = 0; i < 20; i++) {
  result = await rpc.getTransaction(sent.hash);
  if (result.status !== 'NOT_FOUND') break;
  await new Promise((r) => setTimeout(r, 1500));
}
if (result.status !== 'SUCCESS') throw new Error(`Transaction ${sent.hash} ended as ${result.status}`);

const after = (await rpc.getLedgerEntries(instanceKey, codeKey)).entries;
const now = (await rpc.getLatestLedger()).sequence;
for (const e of after) {
  console.log(`${e.key.switch().name}: now expires in ${(((e.liveUntilLedgerSeq - now) * SECONDS_PER_LEDGER) / 86400).toFixed(1)} days`);
}
console.log(`Extended. Tx: https://stellar.expert/explorer/testnet/tx/${sent.hash}`);
