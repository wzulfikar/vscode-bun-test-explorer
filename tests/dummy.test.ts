import { describe, test, it, expect } from "bun:test";

// Top level describe
describe("User Authentication", () => {
  // Setup for all tests in this describe block
  const mockUser = { id: 1, username: "testuser", email: "test@example.com" };
  
  // Nested describe
  describe("Login Process", () => {
    test("should validate username", () => {
      expect(mockUser.username.length).toBeGreaterThan(3);
    });
    
    test.skip("should check for special characters", () => {
      // This test will be skipped
      expect(mockUser.username).not.toContain("@");
    });
    
    // Using it syntax instead of test
    it("should validate email format", () => {
      expect(mockUser.email).toContain("@");
      expect(mockUser.email).toContain(".");
    });
  });
  
  // Another nested describe
  describe("Registration", () => {
    // Deeply nested describe
    describe("Password Requirements", () => {
      it("should require minimum length", () => {
        const password = "securepass123";
        expect(password.length).toBeGreaterThanOrEqual(8);
      });
      
      it.skip("should require uppercase letter", () => {
        // This test will be skipped
        const password = "securepass123";
        expect(password.match(/[A-Z]/)).not.toBeNull();
      });
      
      test("should require numbers", () => {
        const password = "securepass123";
        expect(password.match(/[0-9]/)).not.toBeNull();
      });
    });
    
    test("should prevent duplicate emails", () => {
      const existingEmails = ["user1@example.com", "user2@example.com"];
      expect(existingEmails).not.toContain(mockUser.email);
    });
  });
});

// Another top level describe
describe("Payment Processing", () => {
  const mockPayment = { amount: 99.99, currency: "USD" };
  
  it("should format currency correctly", () => {
    expect(typeof mockPayment.amount).toBe("number");
    expect(mockPayment.currency).toBe("USD");
  });
  
  describe("Refunds", () => {
    it("should allow full refund", () => {
      const refundAmount = mockPayment.amount;
      expect(refundAmount).toBe(mockPayment.amount);
    });
    
    it.skip("should prorate partial refunds", () => {
      // This test will be skipped
      const partial = mockPayment.amount * 0.5;
      expect(partial).toBe(49.995);
    });
  });
  
  describe.skip("International Payments", () => {
    // This entire describe block will be skipped
    test("should convert currency", () => {
      const rate = 0.93; // USD to EUR example rate
      const eurAmount = mockPayment.amount * rate;
      expect(eurAmount).toBeLessThan(mockPayment.amount);
    });
  });
});
