import jsPDF from 'jspdf';

interface ProfileData {
  name?: string;
  email?: string;
  bio?: string;
  education?: Array<{
    degree: string;
    university: string;
    duration: string;
  }>;
  projects?: Array<{
    name: string;
    description: string;
    link: string;
    duration: string;
  }>;
  skills?: Array<{
    name: string;
    proficiency: string;
  }>;
  experiences?: Array<{
    role: string;
    company: string;
    duration: string;
    description: string;
  }>;
}

export function generateProfilePDF(profile: ProfileData): void {
  const doc = new jsPDF();
  let yPosition = 20;
  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - 2 * margin;

  const ensureSpace = (needed: number) => {
    if (yPosition + needed > pageHeight - margin) {
      doc.addPage();
      yPosition = margin;
    }
  };

  const writeLines = (lines: string[], lineHeight: number) => {
    const textLines = Array.isArray(lines) ? lines : [lines];
    textLines.forEach((line) => {
      ensureSpace(lineHeight);
      doc.text(line, margin, yPosition);
      yPosition += lineHeight;
    });
  };

  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  writeLines(doc.splitTextToSize(profile.name || 'Professional Profile', contentWidth), 10);
  yPosition += 5;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  if (profile.email) {
    writeLines([`Email: ${profile.email}`], 7);
  }
  yPosition += 5;

  if (profile.bio) {
    ensureSpace(20);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    writeLines(['Professional Summary'], 8);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    writeLines(doc.splitTextToSize(profile.bio, contentWidth), 5);
    yPosition += 10;
  }

  if (profile.education && profile.education.length > 0) {
    ensureSpace(24);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    writeLines(['Education'], 8);

    profile.education.forEach((edu) => {
      ensureSpace(18);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      writeLines(doc.splitTextToSize(edu.degree || 'Education', contentWidth), 5);
      doc.setFont('helvetica', 'normal');
      const details = [edu.university, edu.duration].filter(Boolean).join(' | ');
      if (details) {
        writeLines(doc.splitTextToSize(details, contentWidth), 5);
      }
      yPosition += 3;
    });
    yPosition += 5;
  }

  if (profile.experiences && profile.experiences.length > 0) {
    ensureSpace(24);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    writeLines(['Work Experience'], 8);

    profile.experiences.forEach((exp) => {
      ensureSpace(22);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      writeLines(doc.splitTextToSize(exp.role || 'Role', contentWidth), 5);
      doc.setFont('helvetica', 'normal');
      const details = [exp.company, exp.duration].filter(Boolean).join(' | ');
      if (details) {
        writeLines(doc.splitTextToSize(details, contentWidth), 5);
      }
      if (exp.description) {
        writeLines(doc.splitTextToSize(exp.description, contentWidth), 4);
      }
      yPosition += 4;
    });
    yPosition += 5;
  }

  if (profile.projects && profile.projects.length > 0) {
    ensureSpace(24);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    writeLines(['Projects'], 8);

    profile.projects.forEach((project) => {
      ensureSpace(22);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      writeLines(doc.splitTextToSize(project.name || 'Project', contentWidth), 5);
      doc.setFont('helvetica', 'normal');
      if (project.duration) {
        writeLines([project.duration], 5);
      }
      if (project.description) {
        writeLines(doc.splitTextToSize(project.description, contentWidth), 4);
      }
      if (project.link) {
        doc.setTextColor(0, 0, 255);
        writeLines(doc.splitTextToSize(`Link: ${project.link}`, contentWidth), 5);
        doc.setTextColor(0, 0, 0);
      }
      yPosition += 3;
    });
    yPosition += 5;
  }

  if (profile.skills && profile.skills.length > 0) {
    ensureSpace(24);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    writeLines(['Skills'], 8);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    const skillsText = profile.skills
      .map((skill) => skill.proficiency ? `${skill.name} (${skill.proficiency})` : skill.name)
      .join(', ');
    writeLines(doc.splitTextToSize(skillsText, contentWidth), 5);
  }

  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const filename = `${(profile.name || 'profile').replace(/\s+/g, '_')}_${timestamp}.pdf`;
  doc.save(filename);
}
