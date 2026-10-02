const COMMERCIAL_FIELDS = ['clientName', 'clientPhone', 'deliveryDate', 'details', 'deliveryType',
  'deliveryAddress', 'deliveryCost', 'subtotal', 'total'];

export function commercialContractFields(input) {
  return Object.fromEntries(COMMERCIAL_FIELDS.map(key => [key, input[key] ?? (
    ['deliveryCost', 'subtotal', 'total'].includes(key) ? 0 : '')]));
}

export function mergeContractPages(previous, next) {
  return [...new Map([...previous, ...next].map(contract => [contract.id, contract])).values()];
}

export function contractCommandSignature(payload) {
  const { newImages = [], ...data } = payload;
  return JSON.stringify({ ...data, newImages: newImages.map(file => ({
    name: file.name, size: file.size, type: file.type, lastModified: file.lastModified,
  })) });
}

export function createContractCommandRegistry(uuid = () => crypto.randomUUID()) {
  const commands = new Map();
  return {
    retain(key, signature) {
      let command = commands.get(key);
      if (!command || command.signature !== signature) {
        command = { signature, operationId: uuid(), contractId: uuid(), initialOperationId: uuid(), images: null };
        commands.set(key, command);
      }
      return command;
    },
    complete(key, command) {
      if (commands.get(key) === command) commands.delete(key);
    },
  };
}
