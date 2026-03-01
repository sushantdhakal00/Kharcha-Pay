import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters");

export const registerBodySchema = z.object({
  email: z.string().email("Invalid email"),
  username: z
    .string()
    .min(2, "Username must be at least 2 characters")
    .max(32, "Username must be at most 32 characters")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Username can only contain letters, numbers, underscore and hyphen"
    ),
  password: passwordSchema,
});

export const loginBodySchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

export const reauthBodySchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordSchema,
});

export const forgotPasswordBodySchema = z.object({
  email: z.string().email("Invalid email"),
});

export const resetPasswordBodySchema = z.object({
  token: z.string().min(1, "Token is required"),
  newPassword: passwordSchema,
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type ReauthBody = z.infer<typeof reauthBodySchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;
