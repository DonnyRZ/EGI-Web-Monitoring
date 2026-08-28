import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, ProjectRequestStatus, ProjectStatus } from "@egi/database";
import { canCreateProjectRequest, canReviewProjectRequests } from "@egi/shared-types";
import type { AuthUser } from "../../common/current-user.decorator";
import { paginatedMeta } from "../../common/mappers";
import { PrismaService } from "../../prisma/prisma.service";
import { createSignedObjectUrl } from "../../common/s3";
import {
  ApproveProjectRequestDto,
  CreateProjectRequestDto,
  ProjectRequestReviewNoteDto,
  ProjectRequestsQueryDto,
  UpdateProjectRequestDto,
} from "./project-requests.dto";

const USER_SUMMARY = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
} as const;

const REQUEST_INCLUDE = {
  submittedBy: { select: USER_SUMMARY },
  reviewedBy: { select: USER_SUMMARY },
  project: { select: { id: true, name: true, status: true } },
} as const satisfies Prisma.ProjectRequestInclude;

type ProjectRequestRecord = Prisma.ProjectRequestGetPayload<{ include: typeof REQUEST_INCLUDE }>;

@Injectable()
export class ProjectRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ProjectRequestsQueryDto, user: AuthUser) {
    this.assertCanRead(user);
    const where = this.buildWhere(query, user);

    const [total, requests] = await this.prisma.$transaction([
      this.prisma.projectRequest.count({ where }),
      this.prisma.projectRequest.findMany({
        where,
        include: REQUEST_INCLUDE,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    return {
      data: requests.map((request) => this.toDto(request)),
      meta: paginatedMeta(query.page, query.limit, total),
    };
  }

  async get(id: string, user: AuthUser) {
    this.assertCanRead(user);
    return this.toDto(await this.getRecord(id, user));
  }

  async getAttachmentSignedUrl(id: string, user: AuthUser) {
    this.assertCanRead(user);
    const request = await this.getRecord(id, user);
    if (!request.attachmentUrl) throw new NotFoundException("Lampiran tidak tersedia");
    const signed = await createSignedObjectUrl(request.attachmentUrl);
    return { url: signed.url, expires_at: signed.expiresAt };
  }

  async create(dto: CreateProjectRequestDto, user: AuthUser) {
    this.assertCanSubmit(user);
    const requestedName = this.requiredText(dto.requested_name, "Nama Project");
    const briefing = this.requiredText(dto.briefing, "Ringkasan kebutuhan");
    const expectedOutcome = this.requiredText(dto.expected_outcome, "Hasil yang diharapkan");
    const proposedDomain = this.optionalDomain(dto.proposed_domain);

    const request = await this.prisma.projectRequest.create({
      data: {
        requestedName,
        briefing,
        expectedOutcome,
        proposedWebsiteName: this.optionalText(dto.proposed_website_name),
        proposedDomain,
        attachmentUrl: this.optionalText(dto.attachment_url),
        submittedById: user.id,
      },
      include: REQUEST_INCLUDE,
    });

    return this.toDto(request);
  }

  async update(id: string, dto: UpdateProjectRequestDto, user: AuthUser) {
    this.assertCanSubmit(user);
    const existing = await this.getRecord(id, user);
    if (existing.status !== ProjectRequestStatus.needs_info) {
      throw new BadRequestException("Pengajuan hanya dapat diperbarui setelah diminta dilengkapi");
    }

    const requestedName = dto.requested_name === undefined
      ? undefined
      : this.requiredText(dto.requested_name, "Nama Project");
    const briefing = dto.briefing === undefined
      ? undefined
      : this.requiredText(dto.briefing, "Ringkasan kebutuhan");
    const expectedOutcome = dto.expected_outcome === undefined
      ? undefined
      : this.requiredText(dto.expected_outcome, "Hasil yang diharapkan");

    const updated = await this.prisma.projectRequest.update({
      where: { id },
      data: {
        requestedName,
        briefing,
        expectedOutcome,
        proposedWebsiteName: dto.proposed_website_name === undefined
          ? undefined
          : this.optionalText(dto.proposed_website_name),
        proposedDomain: dto.proposed_domain === undefined
          ? undefined
          : this.optionalDomain(dto.proposed_domain),
        attachmentUrl: dto.attachment_url === undefined
          ? undefined
          : this.optionalText(dto.attachment_url),
        status: ProjectRequestStatus.pending,
      },
      include: REQUEST_INCLUDE,
    });

    return this.toDto(updated);
  }

  async requestInfo(id: string, dto: ProjectRequestReviewNoteDto, user: AuthUser) {
    this.assertCanReview(user);
    const existing = await this.getAdminRecord(id);
    this.assertReviewable(existing.status);
    const note = this.requiredText(dto.note, "Catatan kelengkapan");

    const updated = await this.prisma.projectRequest.update({
      where: { id },
      data: {
        status: ProjectRequestStatus.needs_info,
        reviewNote: note,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
      include: REQUEST_INCLUDE,
    });

    return this.toDto(updated);
  }

  async reject(id: string, dto: ProjectRequestReviewNoteDto, user: AuthUser) {
    this.assertCanReview(user);
    const existing = await this.getAdminRecord(id);
    this.assertReviewable(existing.status);
    const note = this.requiredText(dto.note, "Alasan penolakan");

    const updated = await this.prisma.projectRequest.update({
      where: { id },
      data: {
        status: ProjectRequestStatus.rejected,
        reviewNote: note,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
      include: REQUEST_INCLUDE,
    });

    return this.toDto(updated);
  }

  async approve(id: string, dto: ApproveProjectRequestDto, user: AuthUser) {
    this.assertCanReview(user);
    const name = this.requiredText(dto.name, "Nama Project");
    const description = this.optionalText(dto.description);
    const reviewNote = this.optionalText(dto.review_note);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.projectRequest.findUnique({
        where: { id },
        include: REQUEST_INCLUDE,
      });
      if (!existing) throw new NotFoundException("Pengajuan Project tidak ditemukan");

      // A retry after a successful approval is safe and returns the already
      // linked Draft instead of creating a second Project.
      if (existing.status === ProjectRequestStatus.approved && existing.projectId && existing.project) {
        return {
          request: this.toDto(existing),
          project: existing.project,
        };
      }
      if (existing.status !== ProjectRequestStatus.pending) {
        throw new ConflictException("Pengajuan ini belum siap untuk disetujui");
      }

      const project = await tx.project.create({
        data: {
          name,
          description: description ?? existing.briefing,
          status: ProjectStatus.draft,
          createdById: user.id,
        },
        select: { id: true, name: true, status: true },
      });
      const updated = await tx.projectRequest.update({
        where: { id },
        data: {
          status: ProjectRequestStatus.approved,
          projectId: project.id,
          reviewNote,
          reviewedById: user.id,
          reviewedAt: new Date(),
        },
        include: REQUEST_INCLUDE,
      });

      return {
        request: this.toDto(updated),
        project,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private buildWhere(query: ProjectRequestsQueryDto, user: AuthUser): Prisma.ProjectRequestWhereInput {
    const where: Prisma.ProjectRequestWhereInput = canReviewProjectRequests(user.role)
      ? {}
      : { submittedById: user.id };

    if (query.status) where.status = query.status;
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.AND = [
        {
          OR: [
            { requestNumber: { contains: search, mode: "insensitive" } },
            { requestedName: { contains: search, mode: "insensitive" } },
            { submittedBy: { name: { contains: search, mode: "insensitive" } } },
            { submittedBy: { email: { contains: search, mode: "insensitive" } } },
          ],
        },
      ];
    }
    return where;
  }

  private async getRecord(id: string, user: AuthUser) {
    const request = await this.prisma.projectRequest.findFirst({
      where: { id, ...this.visibilityWhere(user) },
      include: REQUEST_INCLUDE,
    });
    if (!request) throw new NotFoundException("Pengajuan Project tidak ditemukan");
    return request;
  }

  private async getAdminRecord(id: string) {
    const request = await this.prisma.projectRequest.findUnique({
      where: { id },
      include: REQUEST_INCLUDE,
    });
    if (!request) throw new NotFoundException("Pengajuan Project tidak ditemukan");
    return request;
  }

  private visibilityWhere(user: AuthUser): Prisma.ProjectRequestWhereInput {
    if (canReviewProjectRequests(user.role)) return {};
    if (canCreateProjectRequest(user.role)) return { submittedById: user.id };
    throw new ForbiddenException("Anda tidak memiliki akses ke Pengajuan Project");
  }

  private assertCanRead(user: AuthUser) {
    if (!canReviewProjectRequests(user.role) && !canCreateProjectRequest(user.role)) {
      throw new ForbiddenException("Anda tidak memiliki akses ke Pengajuan Project");
    }
  }

  private assertCanSubmit(user: AuthUser) {
    if (!canCreateProjectRequest(user.role)) {
      throw new ForbiddenException("Hanya PIC Web yang dapat mengajukan Project");
    }
  }

  private assertCanReview(user: AuthUser) {
    if (!canReviewProjectRequests(user.role)) {
      throw new ForbiddenException("Hanya tim IT yang dapat meninjau Pengajuan Project");
    }
  }

  private assertReviewable(status: ProjectRequestStatus) {
    if (status !== ProjectRequestStatus.pending && status !== ProjectRequestStatus.needs_info) {
      throw new ConflictException("Pengajuan ini sudah selesai diproses");
    }
  }

  private requiredText(value: string | undefined, label: string) {
    const text = value?.trim();
    if (!text) throw new BadRequestException(`${label} wajib diisi`);
    return text;
  }

  private optionalText(value: string | undefined) {
    const text = value?.trim();
    return text || null;
  }

  private optionalDomain(value: string | undefined) {
    const domain = this.optionalText(value);
    if (!domain) return null;
    const candidate = domain.includes("://") ? domain : `https://${domain}`;
    try {
      const parsed = new URL(candidate);
      if (!parsed.hostname || /\s/.test(parsed.hostname)) throw new Error("invalid hostname");
    } catch {
      throw new BadRequestException("Domain website tidak valid");
    }
    return domain;
  }

  private toDto(request: ProjectRequestRecord) {
    return {
      id: request.id,
      request_number: request.requestNumber,
      requested_name: request.requestedName,
      briefing: request.briefing,
      expected_outcome: request.expectedOutcome,
      proposed_website_name: request.proposedWebsiteName,
      proposed_domain: request.proposedDomain,
      attachment_url: request.attachmentUrl,
      status: request.status,
      submitted_by: {
        id: request.submittedBy.id,
        name: request.submittedBy.name,
        email: request.submittedBy.email,
      },
      review_note: request.reviewNote,
      reviewed_by: request.reviewedBy
        ? {
            id: request.reviewedBy.id,
            name: request.reviewedBy.name,
            email: request.reviewedBy.email,
          }
        : null,
      reviewed_at: request.reviewedAt,
      project: request.project,
      created_at: request.createdAt,
      updated_at: request.updatedAt,
    };
  }
}
