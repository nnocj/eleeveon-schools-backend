-- ONE consolidated migration: do not also apply the earlier three-table staging migration.
-- Existing academic records and licenses remain unchanged.
CREATE TABLE "IndependentSchool" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IndependentSchool_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IndependentSchool_accountId_id_key" ON "IndependentSchool"("accountId","id");
CREATE INDEX "IndependentSchool_accountId_status_idx" ON "IndependentSchool"("accountId","status");
ALTER TABLE "IndependentSchool" ADD CONSTRAINT "IndependentSchool_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "IndependentBranch" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IndependentBranch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IndependentBranch_accountId_schoolId_id_key" ON "IndependentBranch"("accountId","schoolId","id");
CREATE INDEX "IndependentBranch_accountId_schoolId_status_idx" ON "IndependentBranch"("accountId","schoolId","status");
ALTER TABLE "IndependentBranch" ADD CONSTRAINT "IndependentBranch_accountId_schoolId_fkey" FOREIGN KEY ("accountId","schoolId") REFERENCES "IndependentSchool"("accountId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "IndependentTeacher" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IndependentTeacher_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IndependentTeacher_accountId_schoolId_branchId_id_key" ON "IndependentTeacher"("accountId","schoolId","branchId","id");
CREATE INDEX "IndependentTeacher_accountId_schoolId_branchId_status_idx" ON "IndependentTeacher"("accountId","schoolId","branchId","status");
ALTER TABLE "IndependentTeacher" ADD CONSTRAINT "IndependentTeacher_accountId_schoolId_branchId_fkey" FOREIGN KEY ("accountId","schoolId","branchId") REFERENCES "IndependentBranch"("accountId","schoolId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "IndependentAcademicStructure" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IndependentAcademicStructure_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IndependentAcademicStructure_accountId_schoolId_branchId_id_key" ON "IndependentAcademicStructure"("accountId","schoolId","branchId","id");
CREATE INDEX "IndependentAcademicStructure_accountId_schoolId_branchId_status_idx" ON "IndependentAcademicStructure"("accountId","schoolId","branchId","status");
ALTER TABLE "IndependentAcademicStructure" ADD CONSTRAINT "IndependentAcademicStructure_accountId_schoolId_branchId_fkey" FOREIGN KEY ("accountId","schoolId","branchId") REFERENCES "IndependentBranch"("accountId","schoolId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "IndependentAcademicPeriod" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "academicStructureId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IndependentAcademicPeriod_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IndependentAcademicPeriod_accountId_schoolId_branchId_id_key" ON "IndependentAcademicPeriod"("accountId","schoolId","branchId","id");
CREATE INDEX "IndependentAcademicPeriod_accountId_schoolId_branchId_academicStructureId_idx" ON "IndependentAcademicPeriod"("accountId","schoolId","branchId","academicStructureId");
ALTER TABLE "IndependentAcademicPeriod" ADD CONSTRAINT "IndependentAcademicPeriod_accountId_schoolId_branchId_academicStructureId_fkey" FOREIGN KEY ("accountId","schoolId","branchId","academicStructureId") REFERENCES "IndependentAcademicStructure"("accountId","schoolId","branchId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "IndependentClass" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IndependentClass_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IndependentClass_accountId_schoolId_branchId_id_key" ON "IndependentClass"("accountId","schoolId","branchId","id");
CREATE INDEX "IndependentClass_accountId_schoolId_branchId_status_idx" ON "IndependentClass"("accountId","schoolId","branchId","status");
ALTER TABLE "IndependentClass" ADD CONSTRAINT "IndependentClass_accountId_schoolId_branchId_fkey" FOREIGN KEY ("accountId","schoolId","branchId") REFERENCES "IndependentBranch"("accountId","schoolId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "IndependentSubject" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IndependentSubject_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IndependentSubject_accountId_schoolId_branchId_id_key" ON "IndependentSubject"("accountId","schoolId","branchId","id");
CREATE INDEX "IndependentSubject_accountId_schoolId_branchId_status_idx" ON "IndependentSubject"("accountId","schoolId","branchId","status");
ALTER TABLE "IndependentSubject" ADD CONSTRAINT "IndependentSubject_accountId_schoolId_branchId_fkey" FOREIGN KEY ("accountId","schoolId","branchId") REFERENCES "IndependentBranch"("accountId","schoolId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "IndependentClassSubject" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IndependentClassSubject_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IndependentClassSubject_accountId_schoolId_branchId_id_key" ON "IndependentClassSubject"("accountId","schoolId","branchId","id");
CREATE INDEX "IndependentClassSubject_accountId_schoolId_branchId_classId_subjectId_idx" ON "IndependentClassSubject"("accountId","schoolId","branchId","classId","subjectId");
ALTER TABLE "IndependentClassSubject" ADD CONSTRAINT "IndependentClassSubject_accountId_schoolId_branchId_classId_fkey" FOREIGN KEY ("accountId","schoolId","branchId","classId") REFERENCES "IndependentClass"("accountId","schoolId","branchId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IndependentClassSubject" ADD CONSTRAINT "IndependentClassSubject_accountId_schoolId_branchId_subjectId_fkey" FOREIGN KEY ("accountId","schoolId","branchId","subjectId") REFERENCES "IndependentSubject"("accountId","schoolId","branchId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "IndependentTeacherAssignment" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "classSubjectId" TEXT NOT NULL,
  "academicPeriodId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IndependentTeacherAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IndependentTeacherAssignment_accountId_schoolId_branchId_id_key" ON "IndependentTeacherAssignment"("accountId","schoolId","branchId","id");
CREATE INDEX "IndependentTeacherAssignment_accountId_schoolId_branchId_teacherId_status_idx" ON "IndependentTeacherAssignment"("accountId","schoolId","branchId","teacherId","status");
CREATE INDEX "IndependentTeacherAssignment_accountId_schoolId_branchId_classSubjectId_status_idx" ON "IndependentTeacherAssignment"("accountId","schoolId","branchId","classSubjectId","status");
ALTER TABLE "IndependentTeacherAssignment" ADD CONSTRAINT "IndependentTeacherAssignment_accountId_schoolId_branchId_teacherId_fkey" FOREIGN KEY ("accountId","schoolId","branchId","teacherId") REFERENCES "IndependentTeacher"("accountId","schoolId","branchId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IndependentTeacherAssignment" ADD CONSTRAINT "IndependentTeacherAssignment_accountId_schoolId_branchId_classSubjectId_fkey" FOREIGN KEY ("accountId","schoolId","branchId","classSubjectId") REFERENCES "IndependentClassSubject"("accountId","schoolId","branchId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IndependentTeacherAssignment" ADD CONSTRAINT "IndependentTeacherAssignment_accountId_schoolId_branchId_academicPeriodId_fkey" FOREIGN KEY ("accountId","schoolId","branchId","academicPeriodId") REFERENCES "IndependentAcademicPeriod"("accountId","schoolId","branchId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "IndependentClassTeacher" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "academicPeriodId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IndependentClassTeacher_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IndependentClassTeacher_accountId_schoolId_branchId_id_key" ON "IndependentClassTeacher"("accountId","schoolId","branchId","id");
CREATE INDEX "IndependentClassTeacher_accountId_schoolId_branchId_teacherId_status_idx" ON "IndependentClassTeacher"("accountId","schoolId","branchId","teacherId","status");
CREATE INDEX "IndependentClassTeacher_accountId_schoolId_branchId_classId_status_idx" ON "IndependentClassTeacher"("accountId","schoolId","branchId","classId","status");
ALTER TABLE "IndependentClassTeacher" ADD CONSTRAINT "IndependentClassTeacher_accountId_schoolId_branchId_teacherId_fkey" FOREIGN KEY ("accountId","schoolId","branchId","teacherId") REFERENCES "IndependentTeacher"("accountId","schoolId","branchId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IndependentClassTeacher" ADD CONSTRAINT "IndependentClassTeacher_accountId_schoolId_branchId_classId_fkey" FOREIGN KEY ("accountId","schoolId","branchId","classId") REFERENCES "IndependentClass"("accountId","schoolId","branchId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IndependentClassTeacher" ADD CONSTRAINT "IndependentClassTeacher_accountId_schoolId_branchId_academicPeriodId_fkey" FOREIGN KEY ("accountId","schoolId","branchId","academicPeriodId") REFERENCES "IndependentAcademicPeriod"("accountId","schoolId","branchId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
