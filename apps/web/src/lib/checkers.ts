import type { ConnectorInfo, IdentifierType } from '@/api/types';

/** Which sources look up a kind of identifier: all that can (`can`), those ticked in the form (`on`), and those that will really run (`working`: no missing key). */
export function checkersFor(connectors: ConnectorInfo[], type: IdentifierType, selected: string[]) {
  const can = connectors.filter((c) => c.identifiers.includes(type));
  const on = can.filter((c) => selected.includes(c.id));
  return { can, on, working: on.filter((c) => !c.missingKeys[type]) };
}
