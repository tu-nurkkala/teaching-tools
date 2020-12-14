import "reflect-metadata";
import ac from "ansi-colors";
import { Trace } from "../../src/Trace";

function print(msge: string, ...args: any[]) {
  console.log(`${msge}:`, args.join(" "));
}

function dumpProtoMetadata(msge: string, target: Object) {
  const keys = Reflect.getMetadataKeys(target);
  console.log(`/-------- ${msge} ----------`);
  console.log(ac.yellow("PROTO TARGET"), target);
  for (const key of keys) {
    console.log(ac.yellow("KEY:"), ac.red(key));
    const value = Reflect.getMetadata(key, target);
    console.log("\t", value);
  }
}

function dumpPropMetadata(msge: string, target: Object, propKey: string) {
  const keys = Reflect.getMetadataKeys(target, propKey);
  console.log(`/-------- ${msge} ----------`);
  console.log(ac.yellow("PROP TARGET"), target, " - ", propKey);
  for (const key of keys) {
    console.log(ac.yellow("KEY:"), ac.red(key));
    console.log("\t", Reflect.getMetadata(key, target, propKey));
  }
}

function DecorateClass(target: Object) {
  // print("CTOR", target);
  dumpProtoMetadata("CTOR", target);
}

function DecorateInstanceMethod(
  target: Object,
  name: string,
  propDesc: PropertyDescriptor
) {
  // print("INST METH", target, name, propDesc);
  let type = Reflect.getMetadata("design:type", target, name);
  dumpPropMetadata("INST METH", target, name);
  return propDesc;
}

function DecorateStaticProperty(target: Object, name: string) {
  // print("STAT PROP", target, name);
  dumpPropMetadata("STAT PROP", target, name);
}

function DecorateInstanceProperty(target: Object, name: string) {
  // print("INST PROP", target, name);
  dumpPropMetadata("INST PROP", target, name);
}

function DecorateInstanceParameter(
  target: Object,
  name: string,
  index: number
) {
  // print("INST PARM", target, name, index);
  dumpPropMetadata("INST PARM", target, name);
}

@DecorateClass
class FourFunction {
  @DecorateInstanceProperty
  a: number = 0;
  b: number = 0;

  @DecorateStaticProperty
  static c: string = "Ziffle";

  constructor(a: number, b: number) {
    this.a = a;
    this.b = b;
  }

  @DecorateInstanceMethod
  dump(@DecorateInstanceParameter verbose: boolean) {
    console.log(this.a, this.b);
    return 42;
  }

  @DecorateInstanceMethod
  add(): number {
    return this.a + this.b;
  }

  @Trace()
  sub(alpha: string, beta: string): number {
    console.log(alpha, beta);
    return this.a - this.b;
  }

  @DecorateInstanceMethod
  mul() {
    return this.a * this.b;
  }
}

const calc = new FourFunction(17, 42);
console.log(calc.add());
console.log(calc.sub("aleph", "beth"));
console.log(calc.mul());

console.log("PROP DESCS", Object.getOwnPropertyDescriptors(calc));
console.log("PROP NAMES", Object.getOwnPropertyNames(calc));
console.log("PROP SYMBS", Object.getOwnPropertySymbols(calc));
console.log("PROTOTYPE", Object.getPrototypeOf(calc));
