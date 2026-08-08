function compute(n: number): number {
  const x = n * 2;
  debugger;  // Should pause here
  const y = x + 10;
  return y;
}

for (let i = 0; i < 5; i++) {
  const result = compute(i);
  console.log(`Step ${i}: ${result}`);
}

console.log("Done");
