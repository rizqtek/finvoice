import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserProfile, UserProfileDocument } from '../schemas/user-profile.schema';
import { AuditLog, AuditLogDocument } from '../schemas/audit-log.schema';

@Injectable()
export class UserProfileService {
  private readonly logger = new Logger(UserProfileService.name);

  constructor(
    @InjectModel(UserProfile.name) private userProfileModel: Model<UserProfileDocument>,
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
  ) {}

  async getProfile(userId: string) {
    try {
      let profile = await this.userProfileModel.findOne({ userId }).exec();
      
      if (!profile) {
        // Create default profile if it doesn't exist
        profile = await this.createDefaultProfile(userId);
      }

      return profile;
    } catch (error) {
      this.logger.error(`Failed to get profile for user ${userId}`, error);
      throw error;
    }
  }

  async updateProfile(userId: string, profileData: any) {
    try {
      let profile = await this.userProfileModel.findOne({ userId }).exec();
      
      if (!profile) {
        // Create new profile if it doesn't exist
        profile = new this.userProfileModel({
          userId,
          ...profileData,
        });
      } else {
        // Update existing profile
        Object.assign(profile, profileData);
        profile.updatedAt = new Date();
      }

      const savedProfile = await profile.save();

      // Log the action
      await this.logAction('profile_updated', userId, 'user', profileData);

      this.logger.log(`Profile updated for user ${userId}`);
      return savedProfile;
    } catch (error) {
      this.logger.error(`Failed to update profile for user ${userId}`, error);
      throw error;
    }
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    try {
      const profile = await this.userProfileModel
        .findOneAndUpdate(
          { userId },
          { avatar: avatarUrl, updatedAt: new Date() },
          { new: true, upsert: true }
        )
        .exec();

      await this.logAction('avatar_updated', userId, 'user', { avatarUrl });

      this.logger.log(`Avatar updated for user ${userId}`);
      return profile;
    } catch (error) {
      this.logger.error(`Failed to update avatar for user ${userId}`, error);
      throw error;
    }
  }

  async updatePreferences(userId: string, preferences: any) {
    try {
      const profile = await this.userProfileModel
        .findOneAndUpdate(
          { userId },
          { 
            preferences: preferences,
            updatedAt: new Date()
          },
          { new: true, upsert: true }
        )
        .exec();

      await this.logAction('preferences_updated', userId, 'user', preferences);

      this.logger.log(`Preferences updated for user ${userId}`);
      return profile;
    } catch (error) {
      this.logger.error(`Failed to update preferences for user ${userId}`, error);
      throw error;
    }
  }

  async updateSecuritySettings(userId: string, securitySettings: any) {
    try {
      const profile = await this.userProfileModel
        .findOneAndUpdate(
          { userId },
          { 
            'security': securitySettings,
            updatedAt: new Date()
          },
          { new: true, upsert: true }
        )
        .exec();

      await this.logAction('security_settings_updated', userId, 'user', securitySettings);

      this.logger.log(`Security settings updated for user ${userId}`);
      return profile;
    } catch (error) {
      this.logger.error(`Failed to update security settings for user ${userId}`, error);
      throw error;
    }
  }

  async updateContactInfo(userId: string, contactInfo: any) {
    try {
      const profile = await this.userProfileModel
        .findOneAndUpdate(
          { userId },
          { 
            phone: contactInfo.phone,
            address: contactInfo.address,
            updatedAt: new Date()
          },
          { new: true, upsert: true }
        )
        .exec();

      await this.logAction('contact_info_updated', userId, 'user', contactInfo);

      this.logger.log(`Contact info updated for user ${userId}`);
      return profile;
    } catch (error) {
      this.logger.error(`Failed to update contact info for user ${userId}`, error);
      throw error;
    }
  }

  async updateCompanyInfo(userId: string, companyInfo: any) {
    try {
      const profile = await this.userProfileModel
        .findOneAndUpdate(
          { userId },
          { 
            company: companyInfo,
            updatedAt: new Date()
          },
          { new: true, upsert: true }
        )
        .exec();

      await this.logAction('company_info_updated', userId, 'user', companyInfo);

      this.logger.log(`Company info updated for user ${userId}`);
      return profile;
    } catch (error) {
      this.logger.error(`Failed to update company info for user ${userId}`, error);
      throw error;
    }
  }

  async updateSocialLinks(userId: string, socialLinks: any) {
    try {
      const profile = await this.userProfileModel
        .findOneAndUpdate(
          { userId },
          { 
            socialLinks: socialLinks,
            updatedAt: new Date()
          },
          { new: true, upsert: true }
        )
        .exec();

      await this.logAction('social_links_updated', userId, 'user', socialLinks);

      this.logger.log(`Social links updated for user ${userId}`);
      return profile;
    } catch (error) {
      this.logger.error(`Failed to update social links for user ${userId}`, error);
      throw error;
    }
  }

  async recordLogin(userId: string, ipAddress: string, userAgent: string) {
    try {
      const now = new Date();
      
      // Update analytics
      await this.userProfileModel
        .findOneAndUpdate(
          { userId },
          {
            $inc: { 'analytics.totalLogins': 1 },
            $set: { 
              'analytics.lastActiveAt': now,
              updatedAt: now
            }
          },
          { upsert: true }
        )
        .exec();

      await this.logAction('login_recorded', userId, 'system', { ipAddress, userAgent });

      this.logger.log(`Login recorded for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to record login for user ${userId}`, error);
    }
  }

  async updateSessionDuration(userId: string, duration: number) {
    try {
      const profile = await this.userProfileModel.findOne({ userId }).exec();
      
      if (profile && profile.analytics) {
        const currentAvg = profile.analytics.averageSessionDuration || 0;
        const totalLogins = profile.analytics.totalLogins || 1;
        
        // Calculate new average
        const newAvg = ((currentAvg * (totalLogins - 1)) + duration) / totalLogins;
        
        await this.userProfileModel
          .findOneAndUpdate(
            { userId },
            {
              'analytics.averageSessionDuration': newAvg,
              updatedAt: new Date()
            }
          )
          .exec();
      }
    } catch (error) {
      this.logger.error(`Failed to update session duration for user ${userId}`, error);
    }
  }

  async addPreferredFeature(userId: string, feature: string) {
    try {
      await this.userProfileModel
        .findOneAndUpdate(
          { userId },
          {
            $addToSet: { 'analytics.preferredFeatures': feature },
            updatedAt: new Date()
          },
          { upsert: true }
        )
        .exec();

      this.logger.log(`Preferred feature '${feature}' added for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to add preferred feature for user ${userId}`, error);
    }
  }

  async getAnalytics(userId: string) {
    try {
      const profile = await this.userProfileModel
        .findOne({ userId })
        .select('analytics')
        .exec();

      if (!profile) {
        return {
          totalLogins: 0,
          lastActiveAt: null,
          averageSessionDuration: 0,
          preferredFeatures: []
        };
      }

      return profile.analytics || {};
    } catch (error) {
      this.logger.error(`Failed to get analytics for user ${userId}`, error);
      throw error;
    }
  }

  async deleteProfile(userId: string) {
    try {
      const result = await this.userProfileModel.deleteOne({ userId }).exec();
      
      await this.logAction('profile_deleted', userId, 'system');

      this.logger.log(`Profile deleted for user ${userId}`);
      return { success: true, deletedCount: result.deletedCount };
    } catch (error) {
      this.logger.error(`Failed to delete profile for user ${userId}`, error);
      throw error;
    }
  }

  async exportProfile(userId: string) {
    try {
      const profile = await this.userProfileModel.findOne({ userId }).exec();
      
      if (!profile) {
        throw new NotFoundException('Profile not found');
      }

      await this.logAction('profile_exported', userId, 'user');

      this.logger.log(`Profile exported for user ${userId}`);
      return {
        profile: profile.toObject(),
        exportedAt: new Date()
      };
    } catch (error) {
      this.logger.error(`Failed to export profile for user ${userId}`, error);
      throw error;
    }
  }

  async getProfileCompleteness(userId: string) {
    try {
      const profile = await this.userProfileModel.findOne({ userId }).exec();
      
      if (!profile) {
        return { percentage: 0, missingFields: [] };
      }

      const requiredFields = [
        'avatar', 'phone', 'dateOfBirth', 'address.street', 
        'address.city', 'address.country', 'company.name'
      ];

      const missingFields = [];
      let completedFields = 0;

      for (const field of requiredFields) {
        const value = this.getNestedValue(profile.toObject(), field);
        if (value && value.toString().trim() !== '') {
          completedFields++;
        } else {
          missingFields.push(field);
        }
      }

      const percentage = Math.round((completedFields / requiredFields.length) * 100);

      return {
        percentage,
        completedFields,
        totalFields: requiredFields.length,
        missingFields
      };
    } catch (error) {
      this.logger.error(`Failed to get profile completeness for user ${userId}`, error);
      throw error;
    }
  }

  // Private helper methods
  private async createDefaultProfile(userId: string) {
    try {
      const defaultProfile = new this.userProfileModel({
        userId,
        preferences: {
          emailNotifications: true,
          smsNotifications: false,
          pushNotifications: true,
          marketingEmails: false,
          theme: 'light',
          dateFormat: 'MM/DD/YYYY',
          timeFormat: '12h'
        },
        security: {
          failedLoginAttempts: 0,
          securityQuestions: []
        },
        analytics: {
          totalLogins: 0,
          averageSessionDuration: 0,
          preferredFeatures: []
        }
      });

      const savedProfile = await defaultProfile.save();
      
      await this.logAction('profile_created', userId, 'system');
      
      this.logger.log(`Default profile created for user ${userId}`);
      return savedProfile;
    } catch (error) {
      this.logger.error(`Failed to create default profile for user ${userId}`, error);
      throw error;
    }
  }

  private async logAction(action: string, resourceId: string, userId: string, metadata?: any) {
    try {
      await this.auditLogModel.create({
        userId,
        action,
        resource: 'user_profile',
        resourceId,
        metadata,
        timestamp: new Date()
      });
    } catch (error) {
      this.logger.error('Failed to log action', error);
    }
  }

  private getNestedValue(obj: any, path: string) {
    return path.split('.').reduce((current, key) => current && current[key], obj);
  }
}