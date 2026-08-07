import { prisma } from "../src/prisma.js";
import bcrypt from "bcryptjs";

async function main() {
  await prisma.user.deleteMany()
  await prisma.role.deleteMany()
  
  await prisma.$executeRawUnsafe(
    `UPDATE sqlite_sequence SET seq = 0 WHERE name = 'Role';`
  )

  const passwordHash = await bcrypt.hash("super123", 10);

  const roles = await prisma.role.createManyAndReturn({
    data: [
      { name: 'Admin' },
      { name: 'DeePlace' },
      { name: 'Echo' }
    ],
    select: { id: true },
  })

  //console.log(roles[0].id); 


  const users = await prisma.user.create({
    data: { name: 'Administrator', username: 'super', passwordHash, roleId: roles[0].id }
  })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })