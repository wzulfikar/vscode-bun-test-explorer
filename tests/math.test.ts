describe("Example test", () => {
  test("add two numbers", () => {
    expect(1 + 1).toBe(2);
  });

  test("add two numbers with type", () => {
    const sum: number = 1 + 1
    expect(sum).toBe(2);
  });
});
