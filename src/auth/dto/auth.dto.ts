import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export class RegisterDto {
  @ApiProperty({ example: 'admin@contabeni.bo' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Admin123!', description: 'Mín. 8, mayúscula, minúscula y número' })
  @Matches(PASSWORD_RULE, {
    message:
      'La contraseña debe tener mínimo 8 caracteres con mayúscula, minúscula y número',
  })
  password: string;

  @ApiProperty({ example: 'María' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Rojas' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'Constructora Beni SRL' })
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @ApiPropertyOptional({ example: '1234567029' })
  @IsOptional()
  @IsString()
  @Length(5, 20)
  nit?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'admin@contabeni.bo' })
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({
    description:
      'Empresa a la que desea ingresar; si se omite se usa la primera a la que pertenece',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}

export class RefreshDto {
  @ApiPropertyOptional({ description: 'También se acepta vía cookie httpOnly' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
