import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import { createMathPlugin } from '@streamdown/math';
import { mermaid } from '@streamdown/mermaid';

/** Math plugin with single-dollar inline math enabled. */
export const math = createMathPlugin({ singleDollarTextMath: true });

/** Full Streamdown plugin set used across the application. */
export const streamdownPlugins = { cjk, code, math, mermaid };
