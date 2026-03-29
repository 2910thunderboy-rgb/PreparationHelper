import React from 'react'
import {BrowserRouter as Router, Routes, Route} from 'react-router-dom'
import LandingPage from '../pages/LandingPage'
import Layout from './Layout'
import AnalyzeResume from '@/pages/AnalyzeResume'

import LoginPage from '@/pages/Login'
import RegisterPage from '@/pages/Register'
import Dashboard from '@/pages/Dashboard'
import JobRecommendations from '@/pages/JobRecommendations'
import Profile from '@/pages/Profile'
import Interview from '@/pages/Interview'
import Notes from '@/pages/Notes'
import Referral from '@/pages/Referral'

function Routings() {
  return (
    <div>
        <Router>
            <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/resume" element={<AnalyzeResume />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage/>} />
            <Route path="/app" element={<Layout />} >
                <Route index element={<Dashboard />} />
                <Route path="interview" element={<Interview />} />
                <Route path="resume" element={<AnalyzeResume />} />
                <Route path="job" element={<JobRecommendations />} />
                <Route path="notes" element={<Notes />} />
                <Route path="notes/:topicId" element={<Notes />} />
                <Route path="referral" element={<Referral />} />
                <Route path="profile" element={<Profile />} />
            </Route>
            </Routes>
        </Router>
    </div>
  )
}

export default Routings