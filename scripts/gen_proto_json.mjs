// Regenerates src/data/zmk-studio-proto.json's content from the real .proto
// files (write it via: node scripts/gen_proto_json.mjs > src/data/zmk-studio-proto.json).
// CI runs this on every push/PR (.github/workflows/contract-check.yml) and
// diffs the output against the checked-in file, so a hand-edit of either the
// JSON or the .proto files alone -- without keeping both in sync -- fails
// the build instead of drifting silently.
import protobuf from 'protobufjs';
import path from 'path';

const dirArgIndex = process.argv.indexOf('--proto-dir');
const protoDir =
  (dirArgIndex !== -1 && process.argv[dirArgIndex + 1]) ||
  process.env.PROTO_DIR ||
  '/Users/miyashitakazuya/conductor-dongle/modules/msgs/zmk-studio-messages/proto/zmk';
const root = new protobuf.Root();
root.resolvePath = (origin, target) => {
  if (path.isAbsolute(target)) return target;
  return path.join(protoDir, target);
};

root.load('studio.proto', { keepCase: false })
  .then((loaded) => {
    process.stdout.write(JSON.stringify(loaded.toJSON().nested));
  })
  .catch((e) => {
    console.error('ERR', e);
    process.exit(1);
  });
