function compute(n: number): number {
  const x = n * 2;
  const y = x + 10;
  return y;
}

// This will pause execution
for (let i = 0; i < 5; i++) {
  const result = compute(i);
  console.log(`Step ${i}: ${result}`);
}

console.log("Done");
