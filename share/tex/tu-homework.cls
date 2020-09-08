\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{tu-homework}[2018/08/27 Homework class based on exam]

\RequirePackage{kvoptions}
\SetupKeyvalOptions{
  family=tuhw,
  prefix=tuhw@
}
\DeclareStringOption{course}
\DeclareBoolOption[false]{group}

\ProcessKeyvalOptions*

\LoadClass[addpoints]{exam}

\RequirePackage{\tuhw@course}

\RequirePackage[colorlinks]{hyperref}
\RequirePackage[margin=1.5in]{geometry}
\RequirePackage{adjustbox}
\RequirePackage{booktabs}
\RequirePackage{caption}
\RequirePackage{framed}
\RequirePackage{graphicx}
\RequirePackage{lastpage}
\RequirePackage{xcolor}

\header{
  \color{purple}\iftuhw@group Group\else Individual\fi~Assignment
}{}{Page \thepage\ of \numpages}
\footer{\tucourseid}{\tucoursename}{\tusemester~\the\year}
\headrule
\footrule

\newcommand{\titleblock}[1]{
  \begin{center}
    \color{purple}\Large
    \textbf{#1}
  \end{center}
}

\newenvironment{overview}{\begin{flushleft}\textsc{In this assignment},}{\end{flushleft}}

\renewcommand{\solutiontitle}{
  \noindent
  {\color{purple}\textbf{Solution}}
  \par\noindent
}
