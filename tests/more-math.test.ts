describe("Example test 2", () => {
  test("add two numbers", () => {
    expect(1 + 1).toBe(2);
  });

  test("add two numbers with type", () => {
    const sum: number = 1 + 1
    expect(sum).toBe(2);
  });

  describe("subtract two numbers", () => {
    test.failing("failing test", () => {
      expect(1 - 1).toBe(1);
    });

    test.skip("skipped test", () => {
      expect(1 - 1).toBe(0);
    });
  });
  
  describe("test with it", () => {
    it("test 1", () => {
      expect(1).toBe(1);
    });

    it("test 2", () => {
      expect(1 - 1).toBe(0);
    });
    
    it.skip("test 3", () => {
      expect(1 - 1).toBe(0);
    });
  });
});
