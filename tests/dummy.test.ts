// Top level describe
describe("User Authentication", () => {
  // Setup for all tests in this describe block
  const mockUser = { id: 1, username: "testuser", email: "test@example.com" };

  // Nested describe
  describe("Login Process", () => {
    test("validate username", () => {
      expect(mockUser.username.length).toBeGreaterThan(3);
    });

    test.skip("check for special characters", () => {
      // This test will be skipped
      expect(mockUser.username).not.toContain("@");
    });

    // Using it syntax instead of test
    it("validates email format", () => {
      expect(mockUser.email).toContain("@");
      expect(mockUser.email).toContain(".");
    });
  });

  // Another nested describe
  describe("Registration", () => {
    // Deeply nested describe
    describe("Password Requirements", () => {
      it("requires minimum length", () => {
        const password = "securepass123";
        expect(password.length).toBeGreaterThanOrEqual(8);
      });

      it.skip("requires uppercase letter", () => {
        // This test will be skipped
        const password = "securepass123";
        expect(password.match(/[A-Z]/)).not.toBeNull();
      });

      test("requires numbers", () => {
        const password = "securepass123";
        expect(password.match(/[0-9]/)).not.toBeNull();
      });
    });

    test("prevent duplicate emails", () => {
      const existingEmails = ["user1@example.com", "user2@example.com"];
      expect(existingEmails).not.toContain(mockUser.email);
    });
  });
});

// Another top level describe
describe("Payment Processing", () => {
  const mockPayment = { amount: 99.99, currency: "USD" };

  it("formats currency correctly", () => {
    expect(typeof mockPayment.amount).toBe("number");
    expect(mockPayment.currency).toBe("USD");
  });

  describe("Refunds", () => {
    it("allows full refund", () => {
      const refundAmount = mockPayment.amount;
      expect(refundAmount).toBe(mockPayment.amount);
    });

    it.skip("prorates partial refunds", () => {
      // This test will be skipped
      const partial = mockPayment.amount * 0.5;
      expect(partial).toBe(49.995);
    });
  });

  describe.skip("International Payments", () => {
    // This entire describe block will be skipped
    test("convert currency", () => {
      const rate = 0.93; // USD to EUR example rate
      const eurAmount = mockPayment.amount * rate;
      expect(eurAmount).toBeLessThan(mockPayment.amount);
    });
  });
});
