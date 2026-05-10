package middleware

import (
	"fmt"
	"os"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

func AuthRequired() fiber.Handler {
	return func(c *fiber.Ctx) error {

		authHeader := c.Get("Authorization")

		if !strings.HasPrefix(authHeader, "Bearer ") {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "missing or invalid token"})
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		secret := []byte(os.Getenv("JWT_SECRET"))

		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method")
			}
			return secret, nil
		})
		if err != nil || !token.Valid {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid token"})
		}

		c.Locals("user", token.Claims)
		return c.Next()
	}
}

func RequireRole(roles ...string) fiber.Handler {

	return func(c *fiber.Ctx) error {
		role := GetRole(c)
		for _, allowed := range roles {
			if role == allowed {
				return c.Next()
			}
		}
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden"})
	}
}

func GetRole(c *fiber.Ctx) string {
	claims, ok := c.Locals("user").(jwt.MapClaims)
	if !ok {
		return ""
	}
	role, _ := claims["role"].(string)
	return role
}

func GetUserID(c *fiber.Ctx) uint {
	return getUintClaim(c, "user_id")
}

func GetSchoolID(c *fiber.Ctx) uint {
	return getUintClaim(c, "school_id")
}

func GetTeacherID(c *fiber.Ctx) uint {
	return getUintClaim(c, "teacher_id")
}

func GetStudentID(c *fiber.Ctx) uint {
	return getUintClaim(c, "student_id")
}

func getUintClaim(c *fiber.Ctx, key string) uint {
	claims, ok := c.Locals("user").(jwt.MapClaims)
	if !ok {
		return 0
	}
	val, _ := claims[key].(float64)
	return uint(val)
}
