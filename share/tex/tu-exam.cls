\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{tu-exam}[2017/10/04 Extended exam class]

\RequirePackage{kvoptions}
\SetupKeyvalOptions{
  family=tue,
  prefix=tue@
}
\DeclareStringOption{name}
\DeclareStringOption{course}

\ProcessKeyvalOptions*

\LoadClass{exam}

\RequirePackage{\tue@course}
\RequirePackage[colorlinks]{hyperref}
\RequirePackage{adjustbox}
\RequirePackage{booktabs}
\RequirePackage{graphicx}
\RequirePackage{caption}

% Defined in exam class
\header{\tue@name}{}{Page \thepage\ of \numpages}
\footer{\tucourseid}{\tucoursename}{\tusemester~\the\year}
\headrule
\footrule

\newcommand{\signature}{
  \vspace*{0.25in}
  \hspace{2.5in}Print name:\enspace\hrulefill
}

\newcommand{\instructions}{
  \subsection*{Instructions}
  On all \numpages~pages,
  answer each question
  \emph{correctly} and \emph{succinctly}
  in the space provided.
  If you need more space,
  use the back of the page
  and mark clearly that your answer continues on the back.
  Please write
  \emph{neatly},
  \emph{legibly} and
  \emph{large enough}
  for your answer to be read easily.
  If your answer is undecipherable,
  you will receive no credit.
}

\newcommand{\cartoon}[2]{
  \begin{figure}[h]
    \centering
    \includegraphics[width=0.9\textwidth]{#1}
    \begin{flushright}
      \footnotesize
      \url{#2}
    \end{flushright}
  \end{figure}
}

\newcommand{\relevanthumor}[2]{
  \subsection*{Relevant Humor}
  \cartoon{#1}{#2}
}

\newcommand{\scoringtable}{
  \vfill
  \subsection*{Official Use Only \texttt{:-)}}
  \gradetable
}

\newcommand{\extracreditscoringtable}{
  \vfill
  \subsection*{Official Use Only \texttt{:-)}}
  \combinedgradetable
}

\newcommand{\ejectpage}{\ifprintanswers\else\newpage\fi}