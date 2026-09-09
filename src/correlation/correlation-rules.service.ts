import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CorrelationRule, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { CreateCorrelationRuleDto } from './dto/create-correlation-rule.dto';
import type { UpdateCorrelationRuleDto } from './dto/update-correlation-rule.dto';

@Injectable()
export class CorrelationRulesService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<CorrelationRule[]> {
    return this.prisma.correlationRule.findMany({
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreateCorrelationRuleDto): Promise<CorrelationRule> {
    this.assertOutcome(dto);
    return this.prisma.correlationRule.create({ data: dto });
  }

  async update(
    id: string,
    dto: UpdateCorrelationRuleDto,
  ): Promise<CorrelationRule> {
    const current = await this.findById(id);
    const next = { ...current, ...dto };
    this.assertOutcome(next);
    return this.prisma.correlationRule.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.correlationRule.delete({ where: { id } });
  }

  private async findById(id: string): Promise<CorrelationRule> {
    const rule = await this.prisma.correlationRule.findUnique({
      where: { id },
    });
    if (!rule)
      throw new NotFoundException({
        error: 'CORRELATION_RULE_NOT_FOUND',
        message: 'Correlation rule not found',
      });
    return rule;
  }

  private assertOutcome(
    rule: Pick<
      Prisma.CorrelationRuleCreateInput,
      'incidentType' | 'rootCause' | 'rootCauseConfidence' | 'severity'
    >,
  ): void {
    if (!rule.incidentType && !rule.rootCause && !rule.severity) {
      throw new BadRequestException({
        error: 'CORRELATION_RULE_OUTCOME_REQUIRED',
        message:
          'A correlation rule must define an incident type, root cause, or severity',
      });
    }
    if (rule.rootCauseConfidence !== undefined && !rule.rootCause) {
      throw new BadRequestException({
        error: 'CORRELATION_RULE_ROOT_CAUSE_REQUIRED',
        message: 'rootCauseConfidence requires rootCause',
      });
    }
  }
}
