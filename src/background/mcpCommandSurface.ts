import {
  BRIDGE_COMMAND_NAMES,
  BridgeCommandSchemas,
  type BridgeCommandEnvelope,
} from '../bridge/protocol';
import { executeSubstrateAction } from '../substrate/api/executor';

export const executeBridgeCommand = async (
  command: Omit<BridgeCommandEnvelope, 'id'>
): Promise<unknown> => {
  if (!Object.values(BRIDGE_COMMAND_NAMES).includes(command.command)) {
    throw new Error(`prompt_switchboard_bridge_command_unsupported:${String(command.command)}`);
  }

  const args = BridgeCommandSchemas[command.command].parse(command.args);
  return executeSubstrateAction(command.command, args);
};
