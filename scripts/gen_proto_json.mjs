import protobuf from 'protobufjs';
import path from 'path';

const protoDir = '/Users/miyashitakazuya/zmk-studio-messages/proto/zmk';
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
