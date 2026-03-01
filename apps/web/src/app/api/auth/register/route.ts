import { NextResponse } from "next/server";
import { registerBodySchema } from "@kharchapay/shared";
import { prisma } from "@/lib/db";
import { hashPassword, createToken, setAuthCookieOnResponse } from "@/lib/auth";
import type { ApiUser } from "@kharchapay/shared";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = registerBodySchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.errors?.[0]?.message ?? "Validation failed";
      return NextResponse.json(
        { error: msg, details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { email, username, password } = parsed.data;

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email.toLowerCase() },
          { username: username.toLowerCase() },
        ],
      },
    });
    if (existing) {
      const field = existing.email === email.toLowerCase() ? "email" : "username";
      return NextResponse.json(
        { error: `${field} is already taken` },
        { status: 409 }
      );
    }

    const hashed = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        username: username.toLowerCase(),
        password: hashed,
      },
    });

    const token = await createToken({
      sub: user.id,
      authTime: Math.floor(Date.now() / 1000),
      jwtVersion: user.jwtVersion,
    });

    const apiUser: ApiUser = {
      id: user.id,
      email: user.email,
      username: user.username,
      imageUrl: null,
      createdAt: user.createdAt.toISOString(),
    };
    const response = NextResponse.json({ user: apiUser });
    setAuthCookieOnResponse(response, token);
    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const isDb = message.includes("DATABASE") || message.includes("prisma") || message.includes("connect");
    return NextResponse.json(
      { error: isDb ? "Database error. Ensure DATABASE_URL is set and migrations are run (npm run db:migrate)." : message },
      { status: 500 }
    );
  }
}
