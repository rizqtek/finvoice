import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User } from '../../admin/schemas/user.schema';
import { LoginDto, RegisterDto, RefreshTokenDto } from '../dto/auth.dto';

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: string[];
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponse> {
    try {
      const { email, password, firstName, lastName } = registerDto;

      // Check if user already exists
      const existingUser = await this.userModel.findOne({ email });

      if (existingUser) {
        throw new ConflictException('User with this email already exists');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user
      const user = new this.userModel({
        email,
        firstName,
        lastName,
        password: hashedPassword,
        isActive: true,
        isEmailVerified: false,
        roles: ['user'], // Default role
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await user.save();

      // Generate tokens
      const tokens = await this.generateTokens(user);

      this.logger.log(`User registered: ${email}`);

      return {
        ...tokens,
        user: {
          id: user._id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          roles: user.roles,
        },
      };
    } catch (error) {
      this.logger.error('Registration failed', error);
      throw error;
    }
  }

  async login(loginDto: LoginDto): Promise<AuthResponse> {
    try {
      const { email, password } = loginDto;

      // Find user by email
      const user = await this.userModel.findOne({ email }).select('+password');
      
      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      // Check if user is active
      if (!user.isActive) {
        throw new UnauthorizedException('Account is deactivated');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid credentials');
      }

      // Update last login
      await this.userModel.findByIdAndUpdate(user._id, {
        lastLogin: new Date(),
        $inc: { loginCount: 1 },
      });

      // Generate tokens
      const tokens = await this.generateTokens(user);

      this.logger.log(`User logged in: ${email}`);

      return {
        ...tokens,
        user: {
          id: user._id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          roles: user.roles,
        },
      };
    } catch (error) {
      this.logger.error('Login failed', error);
      throw error;
    }
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto): Promise<AuthResponse> {
    try {
      const { refreshToken } = refreshTokenDto;

      // Verify refresh token
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      // Find user
      const user = await this.userModel.findById(payload.sub);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Generate new tokens
      const tokens = await this.generateTokens(user);

      return {
        ...tokens,
        user: {
          id: user._id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          roles: user.roles,
        },
      };
    } catch (error) {
      this.logger.error('Token refresh failed', error);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string): Promise<{ message: string }> {
    try {
      // Update user logout timestamp
      await this.userModel.findByIdAndUpdate(userId, {
        lastLogout: new Date(),
      });

      this.logger.log(`User logged out: ${userId}`);
      
      return { message: 'Logged out successfully' };
    } catch (error) {
      this.logger.error('Logout failed', error);
      throw error;
    }
  }

  async validateUser(payload: any): Promise<any> {
    const user = await this.userModel.findById(payload.sub).select('-password');
    if (!user || !user.isActive) {
      return null;
    }
    return user;
  }

  private async generateTokens(user: any): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      username: user.username,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_SECRET,
        expiresIn: process.env.JWT_EXPIRES_IN || '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      }),
    ]);

    return { accessToken, refreshToken };
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    try {
      const user = await this.userModel.findOne({ email });
      
      if (!user) {
        // Don't reveal if email exists for security
        return { message: 'If the email exists, a reset link has been sent' };
      }

      // Generate reset token
      const resetToken = await this.jwtService.signAsync(
        { sub: user._id, type: 'password_reset' },
        { 
          secret: process.env.JWT_SECRET,
          expiresIn: '1h' 
        }
      );

      // Save reset token (in production, send via email)
      await this.userModel.findByIdAndUpdate(user._id, {
        passwordResetToken: resetToken,
        passwordResetExpires: new Date(Date.now() + 3600000), // 1 hour
      });

      this.logger.log(`Password reset requested for: ${email}`);
      
      return { message: 'If the email exists, a reset link has been sent' };
    } catch (error) {
      this.logger.error('Password reset failed', error);
      throw error;
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    try {
      // Verify reset token
      const payload = await this.jwtService.verifyAsync(token);
      
      if (payload.type !== 'password_reset') {
        throw new UnauthorizedException('Invalid reset token');
      }

      // Find user with valid reset token
      const user = await this.userModel.findOne({
        _id: payload.sub,
        passwordResetToken: token,
        passwordResetExpires: { $gt: new Date() },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid or expired reset token');
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      // Update password and clear reset token
      await this.userModel.findByIdAndUpdate(user._id, {
        password: hashedPassword,
        passwordResetToken: undefined,
        passwordResetExpires: undefined,
        updatedAt: new Date(),
      });

      this.logger.log(`Password reset completed for user: ${user.email}`);
      
      return { message: 'Password reset successfully' };
    } catch (error) {
      this.logger.error('Password reset failed', error);
      throw new UnauthorizedException('Invalid or expired reset token');
    }
  }
}