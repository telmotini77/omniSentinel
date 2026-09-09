import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

const userAuthorizationArgs = Prisma.validator<Prisma.UserDefaultArgs>()({
  include: {
    roles: {
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    },
  },
});

export type UserWithAuthorization = Prisma.UserGetPayload<
  typeof userAuthorizationArgs
>;

export interface SafeUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  status: UserStatus;
  lastLoginAt: Date | null;
  roles: string[];
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findForAuthentication(
    identity: string,
  ): Promise<UserWithAuthorization | null> {
    return this.prisma.user.findFirst({
      where: {
        OR: [{ email: identity.toLowerCase() }, { username: identity }],
      },
      ...userAuthorizationArgs,
    });
  }

  async findByIdForAuthorization(id: string): Promise<UserWithAuthorization> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      ...userAuthorizationArgs,
    });
    if (!user)
      throw new NotFoundException({
        error: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    return user;
  }

  async list(): Promise<SafeUser[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      ...userAuthorizationArgs,
    });
    return users.map((user) => this.toSafeUser(user));
  }

  async getById(id: string): Promise<SafeUser> {
    return this.toSafeUser(await this.findByIdForAuthorization(id));
  }

  async create(dto: CreateUserDto): Promise<SafeUser> {
    const roles = await this.findRoles(dto.roleNames);
    try {
      const user = await this.prisma.user.create({
        data: {
          username: dto.username,
          email: dto.email.toLowerCase(),
          displayName: dto.displayName,
          passwordHash: await this.hashPassword(dto.password),
          roles: { create: roles.map((role) => ({ roleId: role.id })) },
        },
        ...userAuthorizationArgs,
      });
      return this.toSafeUser(user);
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException({
          error: 'USER_ALREADY_EXISTS',
          message: 'A user with this email or username already exists',
        });
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateUserDto): Promise<SafeUser> {
    await this.findByIdForAuthorization(id);
    const roles = dto.roleNames
      ? await this.findRoles(dto.roleNames)
      : undefined;
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        displayName: dto.displayName,
        status: dto.status,
        passwordHash: dto.password
          ? await this.hashPassword(dto.password)
          : undefined,
        roles: roles
          ? {
              deleteMany: {},
              create: roles.map((role) => ({ roleId: role.id })),
            }
          : undefined,
      },
      ...userAuthorizationArgs,
    });
    return this.toSafeUser(user);
  }

  async markLogin(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  toSafeUser(user: UserWithAuthorization): SafeUser {
    const roles = user.roles.map(({ role }) => role.name);
    const permissions = [
      ...new Set(
        user.roles.flatMap(({ role }) =>
          role.permissions.map(({ permission }) => permission.name),
        ),
      ),
    ].sort();
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      roles,
      permissions,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private async findRoles(roleNames: string[]) {
    const normalizedNames = [...new Set(roleNames)];
    const roles = await this.prisma.role.findMany({
      where: { name: { in: normalizedNames } },
    });
    if (roles.length !== normalizedNames.length) {
      throw new NotFoundException({
        error: 'ROLE_NOT_FOUND',
        message: 'One or more roles do not exist',
      });
    }
    return roles;
  }

  private async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
