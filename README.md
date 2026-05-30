## NestJS-Prisma-Setup-WithPrismaDocs

##### In package.json, add the type field set to "module":

```bash
{
  "type": "commonjs"
}
```

##### Install the necessary Prisma packages and database drivers:

```bash
npm install prisma --save-dev
npm install @prisma/client @prisma/adapter-pg pg
```

##### Initialize Prisma in your project:

```bash
npx prisma init --output ../src/generated/prisma
```

##### Create a Prisma Postgres database and replace the generated DATABASE_URL in your .env file with the postgres://... connection string from the CLI output:

```bash
npx create-db
```

![](/public/Img/prismadatabase.png)

#### .env [set connectionString url]

```bash
DATABASE_URL="postgres://4e691c76b89bdce22f8021901d351842cac264513174eb411d324f47f9e71abc:sk_zyopKm6mwedDhUt_04L_1@db.prisma.io:5432/postgres?sslmode=require"
```

##### Set the generator output path
##### Specify your output path for the generated Prisma client by either passing --output ../src/generated/prisma during prisma init or directly in your Prisma schema:

#### prisma/schema.prisma

```bash
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

##### Define your data model
##### Add the following two models to your schema.prisma file:

#### prisma/schema.prisma

```bash
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String?
  posts Post[]
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String
  content   String?
  published Boolean? @default(false)
  author    User?    @relation(fields: [authorId], references: [id])
  authorId  Int?
}
```

##### Create and run your migration

```bash
npx prisma migrate dev --name init
```

##### Generate Prisma Client

```bash
npx prisma generate
```

##### Create---

```bash
nest g service prisma
nest g service user
nest g service post
```

#### prisma.service.ts

```bash
import { Injectable } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from 'src/generated/prisma/client';


@Injectable()
export class PrismaService extends PrismaClient {
    constructor() {
        const adapter = new PrismaPg({
            connectionString: process.env.DATABASE_URL as string,
        });
        super({ adapter });
    }
}
```

#### user.service.ts

```bash
import { Injectable } from '@nestjs/common';
import { Prisma, User } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class UserService {
    constructor(private prisma: PrismaService) {}

    async user(userWhereUniqueInput: Prisma.UserWhereUniqueInput): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: userWhereUniqueInput,
        });
    }

    async users(params: {
        skip?: number;
        take?: number;
        cursor?: Prisma.UserWhereUniqueInput;
        where?: Prisma.UserWhereInput;
        orderBy?: Prisma.UserOrderByWithRelationInput;
    }): Promise<User[]> {
        const { skip, take, cursor, where, orderBy } = params;
        return this.prisma.user.findMany({
            skip,
            take,
            cursor,
            where,
            orderBy,
        });
    }

    async createUser(data: Prisma.UserCreateInput): Promise<User> {
        return this.prisma.user.create({
            data,
        });
    }

    async updateUser(params: {
        where: Prisma.UserWhereUniqueInput;
        data: Prisma.UserUpdateInput;
    }): Promise<User> {
        const { where, data } = params;
        return this.prisma.user.update({
            data,
            where,
        });
    }

    async deleteUser(where: Prisma.UserWhereUniqueInput): Promise<User> {
        return this.prisma.user.delete({
            where,
        });
    }

}
```

#### post.service.ts

```bash
import { Injectable } from "@nestjs/common";
import { Post, Prisma } from "src/generated/prisma/client";
import { PrismaService } from "src/prisma/prisma.service.js";
@Injectable()
export class PostService {
  constructor(private prisma: PrismaService) {}

  async post(postWhereUniqueInput: Prisma.PostWhereUniqueInput): Promise<Post | null> {
    return this.prisma.post.findUnique({
      where: postWhereUniqueInput,
    });
  }

  async posts(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.PostWhereUniqueInput;
    where?: Prisma.PostWhereInput;
    orderBy?: Prisma.PostOrderByWithRelationInput;
  }): Promise<Post[]> {
    const { skip, take, cursor, where, orderBy } = params;
    return this.prisma.post.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
    });
  }

  async createPost(data: Prisma.PostCreateInput): Promise<Post> {
    return this.prisma.post.create({
      data,
    });
  }

  async updatePost(params: {
    where: Prisma.PostWhereUniqueInput;
    data: Prisma.PostUpdateInput;
  }): Promise<Post> {
    const { data, where } = params;
    return this.prisma.post.update({
      data,
      where,
    });
  }

  async deletePost(where: Prisma.PostWhereUniqueInput): Promise<Post> {
    return this.prisma.post.delete({
      where,
    });
  }
}
```

#### app.controller.ts

```bash
import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { AppService } from './app.service';
import { UserService } from './user/user.service';
import { PostService } from './post/post.service';
import { PostModel, UserModel } from './generated/prisma/models';

@Controller()
export class AppController {
  constructor(
    private readonly UserService: UserService,
    private readonly postService: PostService,
  ) {}

  @Get("post/:id")
  async getPostById(@Param("id") id: string): Promise<PostModel | null> {
    return this.postService.post({ id: Number(id) });
  }

  @Get("feed")
  async getPublishedPosts(): Promise<PostModel[]> {
    return this.postService.posts({
      where: { published: true },
    });
  }

  @Get("filtered-posts/:searchString")
  async getFilteredPosts(@Param("searchString") searchString: string): Promise<PostModel[]> {
    return this.postService.posts({
      where: {
        OR: [
          { title: { contains: searchString } },
          { content: { contains: searchString } },
        ],
      },
    });
  }

  @Post("post")
  async createDraft(
    @Body() postData: { title: string; content?: string; authorEmail: string },
  ): Promise<PostModel> {
    const { title, content, authorEmail } = postData;
    return this.postService.createPost({
      title,
      content,
      author: { connect: { email: authorEmail }, },
    });
  }

  @Post("user")
  async signupUser(
    @Body() userData: { name?: string; email: string }
  ): Promise<UserModel> {
    return this.UserService.createUser(userData);
  }

  @Put("publish/:id")
  async publishPost(@Param("id") id: string): Promise<PostModel> {
    return this.postService.updatePost({
      where: { id: Number(id) },
      data: { published: true },
    });
  }

  @Delete("post/:id")
  async deletePost(@Param("id") id: string): Promise<PostModel> {
    return this.postService.deletePost({ id: Number(id) });
  }
  
}
```

##### Install--- @nestjs/config

```bash
npm i @nestjs/config
```

#### app.module.ts

```bash
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { UserService } from './user/user.service';
import { PostService } from './post/post.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot({})],
  controllers: [AppController],
  providers: [AppService, PrismaService, UserService, PostService],
})
export class AppModule {}
```

#### Noted: if find any error you check package.json and tsconfig.json file for solve.

#### Create a user:
![](/public/Img/createuser.png)

#### Create a post:
![](/public/Img/createpost.png)

#### Get published posts:
![](/public/Img/feed.png)

#### Publish a post:
![](/public/Img/publishedbyid.png)

#### Get post by id:
![](/public/Img/getpost.png)

#### Delete Post by id:
![](/public/Img/deletebyid.png)

#### Search posts:
![](/public/Img/filterpost.png)