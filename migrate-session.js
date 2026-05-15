import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function migrate() {
  try {
    // Create Session table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Session" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "token" TEXT NOT NULL,
        "ipAddress" TEXT,
        "userAgent" TEXT,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
      )
    `);
    console.log('✓ Session table created');

    // Create unique index on token
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "Session_token_key" ON "Session"("token")
    `);
    console.log('✓ Unique index on token created');

    // Create index on userId
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId")
    `);
    console.log('✓ Index on userId created');

    // Create index on expiresAt
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt")
    `);
    console.log('✓ Index on expiresAt created');

    // Add foreign key
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Session" DROP CONSTRAINT IF EXISTS "Session_userId_fkey"
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
    `);
    console.log('✓ Foreign key constraint added');

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

migrate();
