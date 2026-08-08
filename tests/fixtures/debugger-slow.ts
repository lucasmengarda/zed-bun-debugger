import { join } from "node:path";

function fib(n: number): number {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
}

console.log("Starting slow test...");

// Simulate some work
for (let i = 0; i < 100; i++) {
  const result = fib(10);
  if (i === 50) {
    console.log("Halfway:", result);
  }
}

const path = join("/tmp", "test.txt");
console.log("Path:", path);
console.log("Done");
