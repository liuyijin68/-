import { Controller, Post, Get, Body, Param, HttpCode } from '@nestjs/common';
import { GrowthService } from './growth.service';

@Controller('growth')
export class GrowthController {
  constructor(private readonly growthService: GrowthService) {}

  /** 注册用户 */
  @Post('register')
  @HttpCode(200)
  async register(@Body() body: { username: string }) {
    try {
      const user = await this.growthService.register(body.username);
      return { code: 200, msg: '注册成功', data: user };
    } catch (error: any) {
      return { code: 400, msg: error?.message || '注册失败', data: null };
    }
  }

  /** 获取所有用户 */
  @Get('users')
  async listUsers() {
    try {
      const users = await this.growthService.listUsers();
      return { code: 200, msg: 'success', data: users };
    } catch (error: any) {
      return { code: 500, msg: error?.message || '查询失败', data: null };
    }
  }

  /** 获取单个用户信息 */
  @Get('user/:id')
  async getUser(@Param('id') id: string) {
    try {
      const user = await this.growthService.getUser(Number(id));
      return { code: 200, msg: 'success', data: user };
    } catch (error: any) {
      return { code: 400, msg: error?.message || '用户不存在', data: null };
    }
  }

  /** 获取积分（掌握单词） */
  @Post('earn')
  @HttpCode(200)
  async earnPoints(@Body() body: { userId: number; word: string }) {
    try {
      const result = await this.growthService.earnPoints(body.userId, body.word);
      return { code: 200, msg: '积分+1', data: result };
    } catch (error: any) {
      return { code: 400, msg: error?.message || '操作失败', data: null };
    }
  }

  /** 消耗积分 */
  @Post('spend')
  @HttpCode(200)
  async spendPoints(@Body() body: { userId: number; amount: number; reason: string }) {
    try {
      const result = await this.growthService.spendPoints(body.userId, body.amount, body.reason);
      return { code: 200, msg: '消耗成功', data: result };
    } catch (error: any) {
      return { code: 400, msg: error?.message || '操作失败', data: null };
    }
  }

  /** 积分历史 */
  @Get('history/:userId')
  async getHistory(@Param('userId') userId: string) {
    try {
      const records = await this.growthService.getPointsHistory(Number(userId));
      return { code: 200, msg: 'success', data: records };
    } catch (error: any) {
      return { code: 500, msg: error?.message || '查询失败', data: null };
    }
  }

  /** 统计信息 */
  @Get('stats/:userId')
  async getStats(@Param('userId') userId: string) {
    try {
      const stats = await this.growthService.getStats(Number(userId));
      return { code: 200, msg: 'success', data: stats };
    } catch (error: any) {
      return { code: 500, msg: error?.message || '查询失败', data: null };
    }
  }
}
