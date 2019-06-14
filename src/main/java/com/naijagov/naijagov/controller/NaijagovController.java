package com.naijagov.naijagov.controller;

import com.naijagov.naijagov.model.Form;
import com.naijagov.naijagov.service.PollingUnitService;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.servlet.ModelAndView;

@Controller
public class NaijagovController{

    @GetMapping("/pollingunits")
    public ModelAndView pollingUnits(Pageable pageable, @ModelAttribute Form form, ModelAndView mv){
        form.setPollingUnitsPage(pollingUnitService.listAllPollingUnits(pageable));
        mv.setViewName("pollingunits");
        return mv;
    }
    
    @Autowired
    public NaijagovController(PollingUnitService pollingUnitService){
        this.pollingUnitService=pollingUnitService;
    }
    private PollingUnitService pollingUnitService;
}