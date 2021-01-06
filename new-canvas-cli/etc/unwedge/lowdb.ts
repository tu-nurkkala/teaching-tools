import low, { LowdbSync } from "lowdb";
import FileSync from "lowdb/adapters/FileSync";

interface Submission {
  id: number;
}

interface UnwedgeSchema {
  canvas: { account_id: number };
  term: {};
  course: {
    students: {
      [key: number]: {
        name: string;
        submissions: Submission[];
      };
    };
  };
}

const adapter = new FileSync<UnwedgeSchema>("./foo.json");
const db = low(adapter);

db.defaults({
  canvas: { account_id: 1 },
  term: {},
  course: {
    students: {
      17: {
        name: "Fred",
        submissions: [
          {
            id: 1,
          },
        ],
      },
    },
  },
}).write();

function push(path: string, value: any) {
  const arr = db.get(path).value();
  arr.push(value);
  return db.set(path, arr).write();
}

const v2 = push("course.students.17.submissions", { id: 42 });
console.log("TWO", v2);
