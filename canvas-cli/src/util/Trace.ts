// Inspiration:
// https://github.com/aiteq/trace
// https://gist.github.com/sothmann/915b13fdce147e6e1a1e

import ac from "ansi-colors";
import emoji from "node-emoji";
import { inspect } from "util";

interface TraceOptions {
  depth?: number;
}

export function Trace(options: TraceOptions = {}) {
  return function (
    target: Object,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const callEmoji = ` ${emoji.get("arrow_right")}  `;
    const rtnEmoji = ` ${emoji.get("arrow_left")}  `;
    const traceDepth = options.depth || 1;

    const fullMethodName = `${target.constructor.name}.${propertyKey}`;
    console.log(ac.red(`TRACE ${fullMethodName}`));

    if (!descriptor) {
      console.error(
        "No descriptor; are you calling this on a normal method (in a class; not using =>)?"
      );
      throw Error("No descriptor");
    }

    function debugCall(args: any[]) {
      const prettyArgs = args.map((arg) => JSON.stringify(arg)).join(", ");
      const prettyCall = `${callEmoji}${fullMethodName}(${prettyArgs})${callEmoji}`;
      console.group();
      console.log(ac.yellow(prettyCall));
    }

    function debugReturn(rtn: any) {
      const prettyValue = inspect(rtn, { depth: traceDepth });
      const prettyRtn = `${rtnEmoji}${fullMethodName}${rtnEmoji}${prettyValue}`;
      console.log(ac.yellow(prettyRtn));
      console.groupEnd();
    }

    const tracedMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      debugCall(args);
      const rtn = await tracedMethod.apply(this, args);
      debugReturn(rtn);
      return rtn;
    };

    return descriptor;
  };
}
