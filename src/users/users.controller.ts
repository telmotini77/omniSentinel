import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService, type SafeUser } from './users.service';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Permissions('user.read')
  @ApiOperation({
    summary: 'Lists users with their role and permission assignments',
  })
  @ApiOkResponse({ description: 'Users returned without credential hashes' })
  list(): Promise<SafeUser[]> {
    return this.usersService.list();
  }

  @Get(':id')
  @Permissions('user.read')
  @ApiOperation({ summary: 'Gets a user by ID' })
  getById(@Param('id') id: string): Promise<SafeUser> {
    return this.usersService.getById(id);
  }

  @Post()
  @Permissions('user.manage')
  @ApiOperation({ summary: 'Creates a user with one or more system roles' })
  @ApiCreatedResponse({ description: 'User created without credential hashes' })
  create(@Body() dto: CreateUserDto): Promise<SafeUser> {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @Permissions('user.manage')
  @ApiOperation({ summary: 'Updates user status, roles, name, or password' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<SafeUser> {
    return this.usersService.update(id, dto);
  }
}
