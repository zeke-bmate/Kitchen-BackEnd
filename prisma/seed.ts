import { prisma } from "../src/prisma.js";

async function main() {
  
  await prisma.role.deleteMany()
  
  await prisma.$executeRawUnsafe(
    `UPDATE sqlite_sequence SET seq = 0 WHERE name = 'Role ';`
  )

  const roles = await prisma.role.createManyAndReturn({
    data: [
      { name: 'Admin' },
      { name: 'DeePlace' },
      { name: 'Echo' }
    ],
    select: { id: true },
  })

  //console.log(roles[0].id); 
  
  await prisma.user.deleteMany()

  const users = await prisma.user.create({
    data: { name: 'Admintrator', username: 'super', password: 'super123', role: roles[0].id }
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