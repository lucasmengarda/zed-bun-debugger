function greet(name: string) {
  const message = `Hello, ${name}!`;
  console.log(message);
  return message;
}

const result = greet("World");
console.log("Done:", result);
