import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import { createMathPlugin } from '@streamdown/math';
import { mermaid } from '@streamdown/mermaid';

/** Math plugin — only `$$` blocks trigger rendering, not `$`. */
export const math = createMathPlugin({ singleDollarTextMath: false });

/** Full Streamdown plugin set used across the application. */
export const streamdownPlugins = { cjk, code, math, mermaid };
