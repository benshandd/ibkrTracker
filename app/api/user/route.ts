import { getUser } from '@/lib/db/queries';

export async function GET() {
  const user = await getUser();
  if (!user) return Response.json(null);
  // Return safe subset only; never expose passwordHash or encrypted IBKR fields
  const safe = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
  return Response.json(safe);
}
