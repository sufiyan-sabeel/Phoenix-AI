import type { PhoenixExtension, ExtensionContext } from '../index.js';

export const greeterExtension: PhoenixExtension = {
  id: 'phoenix-greeter',
  name: 'Phoenix Greeter',
  version: '1.0.0',
  description: 'Example extension that greets the user on session start',
  author: 'Umaiz Sufiyan',
  onActivate(ctx: ExtensionContext) {
    console.log('Phoenix Greeter extension activated!');
  },
  onDeactivate() {
    console.log('Phoenix Greeter extension deactivated.');
  }
};
